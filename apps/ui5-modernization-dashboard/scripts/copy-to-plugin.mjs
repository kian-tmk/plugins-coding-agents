// Copies the built dashboard artifacts into the plugin so the plugin is
// self-contained (no "../.." escape in .mcp.json). Source of truth stays in
// apps/ui5-modernization-dashboard/; run `npm run deliver` after changing the
// server or UI. The in-plugin layout mirrors the app's dist-server/ + dist/
// so server.ts's import.meta.url-relative "../dist/mcp-app.html" resolution
// works unchanged.
import { cp, mkdir, rm, writeFile, access } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = path.dirname(fileURLToPath(import.meta.url)).replace(/\/scripts$/, "");
const PLUGIN_DASHBOARD = path.resolve(APP_DIR, "../../plugins/ui5-modernization/dashboard");

const files = [
  ["dist-server/main.js", "dist-server/main.js"],
  ["dist/mcp-app.html", "dist/mcp-app.html"],
  ["desktop-setup.mjs", "desktop-setup.mjs"],
  ["desktop-setup-worker.mjs", "desktop-setup-worker.mjs"],
];

await rm(PLUGIN_DASHBOARD, { recursive: true, force: true });
for (const [src, dst] of files) {
  const from = path.join(APP_DIR, src);
  const to = path.join(PLUGIN_DASHBOARD, dst);
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to);
  console.log(`copied ${src} -> plugins/ui5-modernization/dashboard/${dst}`);
}
await writeFile(path.join(PLUGIN_DASHBOARD, "package.json"), JSON.stringify({ private: true, type: "module" }, null, 2) + "\n");
console.log("Dashboard artifacts delivered into the plugin.");

// ── Dev sync: refresh the Claude Desktop runtime copy (if it exists) ────────────
// The Desktop widget loads the server from an app-config-registered runtime copy
// under ~/Library/Application Support/..., NOT from this repo. That copy is only
// written by the setup-desktop-dashboard tool on a Claude quit, so a plain deliver
// leaves the Desktop running a stale build. Here we additionally overwrite the
// runtime copy for any profile that already has one — never creating it (that
// stays the setup tool's job), only keeping an existing install current. This
// deliberately bypasses the staged/atomic install path; a running server still
// needs a restart afterwards to pick up the new main.js.
const RUNTIME_ARTIFACTS = ["dist-server/main.js", "dist/mcp-app.html"];
const supportRoot = path.join(homedir(), "Library", "Application Support", "UI5 Modernization Dashboard");

for (const profile of ["claude", "claude-3p"]) {
  const runtime = path.join(supportRoot, profile, "runtime");
  try {
    await access(path.join(runtime, "dist-server", "main.js"));
  } catch {
    continue; // no runtime for this profile — leave it to setup-desktop-dashboard
  }
  for (const rel of RUNTIME_ARTIFACTS) {
    const to = path.join(runtime, rel);
    await mkdir(path.dirname(to), { recursive: true });
    await cp(path.join(APP_DIR, rel), to);
  }
  await writeFile(path.join(runtime, "package.json"), JSON.stringify({ type: "module" }) + "\n");
  console.log(`runtime (${profile}) refreshed -> ${runtime} (restart the Desktop server to load it)`);
}
