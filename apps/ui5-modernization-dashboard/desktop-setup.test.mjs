import assert from "node:assert/strict";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  completeDesktopSetup,
  inspectDesktopSetup,
  prepareDesktopSetup,
  reopenArguments,
} from "./desktop-setup.mjs";

function fixture(t, profile = "claude-3p") {
  const home = mkdtempSync(join(tmpdir(), "ui5 desktop setup "));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const bundleRoot = join(home, "plugin bundle");
  for (const [file, text] of [
    ["dist-server/main.js", "export const bundled = true;"],
    ["dist/mcp-app.html", "<html>dashboard</html>"],
  ]) {
    mkdirSync(dirname(join(bundleRoot, file)), { recursive: true });
    writeFileSync(join(bundleRoot, file), text);
  }
  for (const file of ["desktop-setup.mjs", "desktop-setup-worker.mjs"])
    copyFileSync(
      fileURLToPath(new URL(file, import.meta.url)),
      join(bundleRoot, file),
    );
  const options = {
    home,
    userDataDir: "",
    platform: "darwin",
    profile,
    bundleRoot,
  };
  const location = inspectDesktopSetup(options);
  let task,
    submits = 0;
  const system = {
    runningClaude: () => [
      {
        pid: 12345,
        identity: "original process",
        appPath: "/Applications/Claude.app",
      },
    ],
    submitJob: (value) => {
      task = value;
      submits++;
    },
    jobExists: () => true,
    removeJob: () => {},
  };
  const prepare = () => prepareDesktopSetup(options, system);
  const putConfig = (text) => {
    mkdirSync(dirname(location.config), { recursive: true });
    writeFileSync(location.config, text);
  };
  return {
    options,
    location,
    prepare,
    putConfig,
    get task() {
      return task;
    },
    get submits() {
      return submits;
    },
    system,
  };
}

test("waits for quit, preserves the final cache write, reopens after registration, and remains idempotent", async (t) => {
  const f = fixture(t);
  f.putConfig(
    JSON.stringify({
      deploymentMode: "3p",
      preferences: { value: "before" },
    }),
  );
  assert.equal(f.prepare().status, "waiting-for-quit");
  assert.equal(f.submits, 1);
  assert.equal(
    JSON.parse(readFileSync(f.location.config)).mcpServers,
    undefined,
  );
  let alive = true,
    opens = 0,
    removes = 0;
  const lastConfig = JSON.stringify({
    deploymentMode: "3p",
    preferences: { value: "last cache write" },
    mcpServers: { other: { command: "keep", env: { VALUE: "preserved" } } },
  });
  await completeDesktopSetup(f.task, {
    processIdentity: () => (alive ? "original process" : null),
    sleep: async () => {
      assert.equal(existsSync(f.location.runtime), false);
      f.putConfig(lastConfig);
      alive = false;
    },
    runningClaude: () => [],
    reopenClaude: () => {
      const actual = JSON.parse(readFileSync(f.location.config));
      assert.equal(actual.preferences.value, "last cache write");
      assert.equal(actual.mcpServers.other.env.VALUE, "preserved");
      assert.deepEqual(
        actual.mcpServers["ui5-modernization-dashboard"],
        f.location.entry,
      );
      assert.equal(
        JSON.parse(
          readFileSync(join(f.location.runtime, "package.json")),
        ).type,
        "module",
      );
      opens++;
    },
    removeJob: () => {
      removes++;
    },
  });
  const backups = readdirSync(dirname(f.location.config)).filter((name) =>
    name.endsWith(".bak"),
  );
  assert.equal(backups.length, 1);
  assert.equal(
    readFileSync(join(dirname(f.location.config), backups[0]), "utf8"),
    lastConfig,
  );
  assert.equal(opens, 1);
  assert.equal(removes, 1);
  assert.equal(existsSync(f.task.stage), false);
  assert.equal(
    JSON.parse(readFileSync(f.location.stateFile)).status,
    "reopened",
  );
  assert.equal(f.prepare().status, "configured");
  assert.equal(f.submits, 1);
  assert.equal(
    inspectDesktopSetup({ ...f.options, bundleRoot: f.location.runtime })
      .installed,
    true,
  );
});

test("repeated setup requests reuse the pending job", (t) => {
  const f = fixture(t);
  assert.equal(f.prepare().status, "waiting-for-quit");
  const stage = f.task.stage;
  assert.equal(f.prepare().status, "waiting-for-quit");
  assert.equal(f.task.stage, stage);
  assert.equal(f.submits, 1);
});

test("profile selection and preview never create or edit the config", (t) => {
  const f = fixture(t, "claude");
  assert.ok(f.location.config.endsWith("/Claude/claude_desktop_config.json"));
  assert.equal(existsSync(f.location.root), false);
  assert.throws(
    () => inspectDesktopSetup({ ...f.options, profile: "unknown" }),
    /active Claude/,
  );
  assert.throws(
    () => inspectDesktopSetup({ ...f.options, userDataDir: "relative" }),
    /absolute/,
  );
  assert.throws(
    () => prepareDesktopSetup({ ...f.options, platform: "linux" }),
    /macOS/,
  );
  assert.equal(existsSync(f.location.root), false);
});

test("invalid configs, a wrong profile, or missing bundles never schedule a restart", (t) => {
  const f = fixture(t);
  for (const original of [
    "{broken",
    "[]",
    "null",
    '{"mcpServers":null}',
    '{"deploymentMode":"1p"}',
  ]) {
    f.putConfig(original);
    assert.throws(f.prepare);
    assert.equal(readFileSync(f.location.config, "utf8"), original);
  }
  f.putConfig("{}");
  rmSync(join(f.options.bundleRoot, "desktop-setup-worker.mjs"));
  assert.throws(f.prepare, /complete dashboard bundle/);
  assert.equal(f.submits, 0);
});

test("scheduler failure leaves the config untouched and records failure", (t) => {
  const f = fixture(t);
  f.putConfig("{}");
  f.system.submitJob = () => {
    throw new Error("launchd denied");
  };
  assert.throws(f.prepare, /launchd denied/);
  assert.equal(readFileSync(f.location.config, "utf8"), "{}");
  assert.equal(
    JSON.parse(readFileSync(f.location.stateFile)).status,
    "failed",
  );
  assert.deepEqual(readdirSync(join(f.location.root, "pending")), []);
});

test("expired requests finish without changing config or reopening Claude", async (t) => {
  const f = fixture(t);
  f.putConfig("{}");
  f.prepare();
  f.task.expiresAt = Date.now() - 1;
  await completeDesktopSetup(f.task, {
    processIdentity: () => "original process",
    removeJob: () => {},
    reopenClaude: () => assert.fail("unexpected open"),
  });
  assert.equal(readFileSync(f.location.config, "utf8"), "{}");
  assert.equal(
    JSON.parse(readFileSync(f.location.stateFile)).status,
    "expired",
  );
});

test("reopening Claude too early aborts without overwriting its config", async (t) => {
  const f = fixture(t);
  f.putConfig("{}");
  f.prepare();
  await assert.rejects(
    completeDesktopSetup(f.task, {
      processIdentity: () => null,
      runningClaude: () => [{ pid: 999 }],
      removeJob: () => {},
      reopenClaude: () => assert.fail("unexpected open"),
    }),
    /reopened before setup/,
  );
  assert.equal(readFileSync(f.location.config, "utf8"), "{}");
  assert.equal(existsSync(f.location.runtime), false);
});

test("a broken final config is preserved and reported without reopening", async (t) => {
  const f = fixture(t);
  f.prepare();
  f.putConfig("{broken");
  await assert.rejects(
    completeDesktopSetup(f.task, {
      processIdentity: () => null,
      runningClaude: () => [],
      removeJob: () => {},
      reopenClaude: () => assert.fail("unexpected open"),
    }),
  );
  assert.equal(readFileSync(f.location.config, "utf8"), "{broken");
  assert.equal(
    JSON.parse(readFileSync(f.location.stateFile)).status,
    "failed",
  );
  assert.equal(existsSync(f.task.stage), false);
});

test("bundle changes require another prepared setup while keeping a stable config path", async (t) => {
  const f = fixture(t);
  f.prepare();
  await completeDesktopSetup(f.task, {
    processIdentity: () => null,
    runningClaude: () => [],
    removeJob: () => {},
    reopenClaude: () => {},
  });
  const before = readFileSync(f.location.config, "utf8");
  writeFileSync(
    join(f.options.bundleRoot, "dist/mcp-app.html"),
    "<html>updated</html>",
  );
  assert.equal(f.prepare().status, "waiting-for-quit");
  assert.equal(readFileSync(f.location.config, "utf8"), before);
  assert.deepEqual(f.task.entry, f.location.entry);
});

test("workflow continuation survives shutdown and opens the correct project with a draft", async (t) => {
  const f = fixture(t);
  const projectPath = join(f.options.home, "UI5 Projekt ä & #1");
  mkdirSync(projectPath);
  Object.assign(f.options, {
    projectPath,
    resumeContext: "Full autonomous; Änderungen nicht committen.",
  });
  const result = f.prepare();
  const persisted = JSON.parse(readFileSync(join(f.task.stage, "task.json")));
  assert.deepEqual(result.resume, persisted.resume);
  const url = new URL(persisted.resume.url);
  assert.equal(url.protocol, "claude:");
  assert.equal(url.host, "code");
  assert.equal(url.pathname, "/new");
  assert.equal(url.searchParams.get("folder"), projectPath);
  assert.equal(url.searchParams.get("q"), persisted.resume.prompt);
  assert.ok(persisted.resume.prompt.includes(f.options.resumeContext));
  assert.equal(url.searchParams.has("autoSubmit"), false);
  assert.deepEqual(reopenArguments(persisted), [
    "-a",
    "/Applications/Claude.app",
    persisted.resume.url,
  ]);
  persisted.userDataDir = join(f.options.home, "Custom profile");
  assert.deepEqual(reopenArguments(persisted).slice(-2), [
    "--env",
    `CLAUDE_USER_DATA_DIR=${persisted.userDataDir}`,
  ]);
  assert.deepEqual(f.prepare().resume, result.resume);
  let opens = 0;
  await completeDesktopSetup(persisted, {
    processIdentity: () => null,
    runningClaude: () => [],
    removeJob: () => {},
    reopenClaude: (task) => {
      assert.deepEqual(task.resume, result.resume);
      assert.ok(JSON.parse(readFileSync(f.location.config)).mcpServers);
      opens++;
    },
  });
  assert.equal(opens, 1);
  assert.deepEqual(
    JSON.parse(readFileSync(f.location.stateFile)).resume,
    result.resume,
  );
  assert.equal(f.prepare().status, "configured");
  assert.equal(f.submits, 1);
});

test("invalid continuation or conflicting projects do not schedule another job", (t) => {
  const f = fixture(t);
  f.options.projectPath = "relative";
  assert.throws(f.prepare, /absolute directory/);
  f.options.projectPath = f.options.home;
  f.options.resumeContext = "x".repeat(2001);
  assert.throws(f.prepare, /2000/);
  delete f.options.projectPath;
  assert.throws(f.prepare, /requires a project/);
  delete f.options.resumeContext;
  assert.equal(f.submits, 0);
  f.options.projectPath = f.options.home;
  f.prepare();
  const original = readFileSync(f.location.stateFile, "utf8");
  f.options.projectPath = f.options.bundleRoot;
  assert.throws(f.prepare, /different workflow/);
  assert.equal(f.submits, 1);
  assert.equal(readFileSync(f.location.stateFile, "utf8"), original);
  assert.equal(existsSync(f.location.config), false);
});
