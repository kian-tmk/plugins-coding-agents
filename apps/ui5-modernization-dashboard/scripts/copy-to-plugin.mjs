// Copies the built dashboard artifacts into the plugin so the plugin is
// self-contained (no "../.." escape in .mcp.json). Source of truth stays in
// apps/ui5-modernization-dashboard/; run `npm run deliver` after changing the
// server or UI. The in-plugin layout mirrors the app's dist-server/ + dist/
// so server.ts's import.meta.url-relative "../dist/mcp-app.html" resolution
// works unchanged.
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = path.dirname(fileURLToPath(import.meta.url)).replace(/\/scripts$/, "");
const PLUGIN_DASHBOARD = path.resolve(APP_DIR, "../../plugins/ui5-modernization/dashboard");

const files = [
  ["dist-server/main.js", "dist-server/main.js"],
  ["dist/mcp-app.html", "dist/mcp-app.html"],
];

await rm(PLUGIN_DASHBOARD, { recursive: true, force: true });
for (const [src, dst] of files) {
  const from = path.join(APP_DIR, src);
  const to = path.join(PLUGIN_DASHBOARD, dst);
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to);
  console.log(`copied ${src} -> plugins/ui5-modernization/dashboard/${dst}`);
}
console.log("Dashboard artifacts delivered into the plugin.");
