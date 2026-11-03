// Optional macOS integration check. Uses a fake app and a temporary profile.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  inspectDesktopSetup,
  prepareDesktopSetup,
  processIdentity,
} from "../desktop-setup.mjs";

if (process.platform !== "darwin")
  throw new Error("This integration check requires macOS.");
const home = mkdtempSync(join(tmpdir(), "ui5 launchd integration "));
const bundleRoot = join(home, "plugin");
const app = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
  stdio: "ignore",
});
const marker = join(home, "reopened.json");
let label;
try {
  for (const [file, text] of [
    ["dist-server/main.js", "export const test = true;"],
    ["dist/mcp-app.html", "<html>test</html>"],
  ]) {
    mkdirSync(dirname(join(bundleRoot, file)), { recursive: true });
    writeFileSync(join(bundleRoot, file), text);
  }
  copyFileSync(
    fileURLToPath(new URL("../desktop-setup.mjs", import.meta.url)),
    join(bundleRoot, "desktop-setup.mjs")
  );
  writeFileSync(
    join(bundleRoot, "desktop-setup-worker.mjs"),
    [
      'import {readFileSync,writeFileSync} from "node:fs";',
      'import {completeDesktopSetup} from "./desktop-setup.mjs";',
      'const task=JSON.parse(readFileSync(process.argv[2],"utf8"));',
      "await completeDesktopSetup(task,{runningClaude:()=>[],reopenClaude:()=>writeFileSync(" +
        JSON.stringify(marker) +
        ",readFileSync(task.config))});",
    ].join(String.fromCharCode(10))
  );
  await sleep(100);
  const options = { profile: "claude-3p", home, userDataDir: "", bundleRoot };
  const location = inspectDesktopSetup(options);
  mkdirSync(dirname(location.config), { recursive: true });
  writeFileSync(
    location.config,
    JSON.stringify({ preferences: { value: "initial" } })
  );
  const result = prepareDesktopSetup(options, {
    runningClaude: () => [
      {
        pid: app.pid,
        identity: processIdentity(app.pid),
        appPath: "/test/Claude.app",
      },
    ],
  });
  label = JSON.parse(readFileSync(location.stateFile)).label;
  assert.equal(result.status, "waiting-for-quit");
  await sleep(600);
  assert.equal(
    JSON.parse(readFileSync(location.config)).mcpServers,
    undefined
  );
  writeFileSync(
    location.config,
    JSON.stringify({
      preferences: { value: "final shutdown write" },
      mcpServers: { other: { command: "keep" } },
    })
  );
  const exited = once(app, "exit");
  app.kill("SIGTERM");
  await exited;
  const end = Date.now() + 10000;
  while (
    JSON.parse(readFileSync(location.stateFile)).status !== "reopened" &&
    Date.now() < end
  )
    await sleep(100);
  const state = JSON.parse(readFileSync(location.stateFile));
  assert.equal(state.status, "reopened", JSON.stringify(state));
  const config = JSON.parse(readFileSync(marker));
  assert.equal(config.preferences.value, "final shutdown write");
  assert.equal(config.mcpServers.other.command, "keep");
  assert.deepEqual(
    config.mcpServers["ui5-modernization-dashboard"],
    location.entry
  );
  assert.equal(existsSync(state.stage), false);
  console.log(
    JSON.stringify({
      launchdWorker: "passed",
      writeOnlyAfterQuit: true,
      finalPreferencesPreserved: true,
      reopenOnlyAfterRegistration: true,
      pendingFilesRemoved: true,
    })
  );
} finally {
  if (app.exitCode === null && app.signalCode === null) app.kill("SIGTERM");
  if (label) {
    try {
      execFileSync("/bin/launchctl", ["remove", label], {
        stdio: "ignore",
      });
    } catch {}
  }
  rmSync(home, { recursive: true, force: true });
}
