import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";

const serverName = "ui5-modernization-dashboard";
const artifacts = [
  "dist-server/main.js",
  "dist/mcp-app.html",
  "desktop-setup.mjs",
  "desktop-setup-worker.mjs",
];
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const quitMessage =
  "Das Dashboard ist vorbereitet. Beende Claude einmal vollständig mit ⌘Q. Die Einrichtung wird abgeschlossen und Claude automatisch wieder geöffnet.";

function workflowResume(options) {
  if (options.projectPath === undefined) {
    if (options.resumeContext !== undefined)
      throw new Error("Workflow context requires a project path.");
    return undefined;
  }
  if (
    typeof options.projectPath !== "string" ||
    !isAbsolute(options.projectPath) ||
    !statSync(options.projectPath).isDirectory()
  )
    throw new Error(
      "The workflow project must be an existing absolute directory."
    );
  if (
    options.resumeContext !== undefined &&
    (typeof options.resumeContext !== "string" ||
      options.resumeContext.length > 2000)
  )
    throw new Error(
      "Workflow context must be text of at most 2000 characters."
    );
  const prompt = [
    "Setze die bereits beauftragte UI5-Modernisierung mit dem Plugin-Skill modernize-ui5-app fort.",
    "Unterbrechung: Phase 0, Dashboard-Einrichtung, vor der Verifikationsmodus-Auswahl und vor allen Modernisierungsänderungen.",
    "Der Nutzer hat dem Desktop-Dashboard bereits zugestimmt. Die Registrierung wurde nach dem Beenden von Claude abgeschlossen.",
    "Überspringe die Dashboard-Frage und erneute Einrichtung. Öffne das Dashboard genau einmal mit open-dashboard über den app-registrierten ui5-modernization-dashboard-Server (nicht plugin_). Für spätere Statusprüfungen verwende get-status, für Updates update-status; diese öffnen kein weiteres Widget. Wenn der Server fehlt, melde das und fahre ohne das optionale Dashboard fort.",
    "Fahre danach mit dem Workflow fort. Frage nach dem Verifikationsmodus nur, sofern er noch nicht festgelegt wurde und kein nicht-interaktiver Auftrag vorliegt. Beachte vorhandene Änderungen im Projekt.",
    options.resumeContext
      ? `Bereits vereinbarte Vorgaben: ${options.resumeContext}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  const url = new URL("claude://code/new");
  url.searchParams.set("folder", options.projectPath);
  url.searchParams.set("q", prompt);
  return { projectPath: options.projectPath, prompt, url: url.href };
}

function pendingResult(config, resume) {
  return {
    status: "waiting-for-quit",
    config,
    ...(resume ? { resume } : {}),
    message:
      quitMessage +
      (resume
        ? " Im neuen Code-Chat ist der Fortsetzungsauftrag vorbereitet. Bestätige gegebenenfalls den Projektordner und klicke einmal auf Senden. Falls der Link nicht übernommen wird, öffne einen Code-Chat im Projekt und füge den mitgelieferten Fortsetzungsauftrag ein."
        : ""),
  };
}

function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, "utf8"));
}

function readConfig(file) {
  const data = readJson(file, {});
  if (
    !object(data) ||
    (data.mcpServers !== undefined && !object(data.mcpServers))
  )
    throw new Error(
      "Invalid Claude config; the original file has not been changed."
    );
  return data;
}

function writeAtomic(file, text, mode = 0o600) {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, text, { flag: "wx", mode });
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function writeState(task, status, extra = {}) {
  writeAtomic(
    task.stateFile,
    JSON.stringify(
      {
        status,
        label: task.label,
        stage: task.stage,
        config: task.config,
        expiresAt: task.expiresAt,
        updatedAt: new Date().toISOString(),
        ...(task.resume ? { resume: task.resume } : {}),
        ...extra,
      },
      null,
      2
    )
  );
}

const psEnv = { ...process.env, LANG: "C", LC_ALL: "C" };

export function processIdentity(pid) {
  try {
    return execFileSync(
      "/bin/ps",
      ["-p", String(pid), "-o", "lstart=,comm="],
      { encoding: "utf8", timeout: 5000, env: psEnv }
    ).trim();
  } catch (error) {
    if (error.status === 1 && !String(error.stderr ?? "").trim())
      return null;
    throw error;
  }
}

export function runningClaude() {
  return execFileSync("/bin/ps", ["-axo", "pid=,comm="], {
    encoding: "utf8",
    timeout: 5000,
    env: psEnv,
  })
    .split(String.fromCharCode(10))
    .map((line) => line.trim())
    .filter((line) => line.endsWith("/Contents/MacOS/Claude"))
    .map((line) => {
      const separator = line.indexOf(" "),
        pid = Number(line.slice(0, separator));
      const command = line.slice(separator).trim();
      return {
        pid,
        identity: processIdentity(pid),
        appPath: command.slice(0, -"/Contents/MacOS/Claude".length),
      };
    });
}

function paths({
  profile,
  home = homedir(),
  userDataDir = process.env.CLAUDE_USER_DATA_DIR,
}) {
  if (!["claude", "claude-3p"].includes(profile))
    throw new Error("Select the active Claude Desktop profile.");
  if (!isAbsolute(home) || (userDataDir && !isAbsolute(userDataDir)))
    throw new Error("Profile paths must be absolute.");
  const support = join(home, "Library", "Application Support");
  const root = join(support, "UI5 Modernization Dashboard", profile);
  return {
    root,
    runtime: join(root, "runtime"),
    config: join(
      userDataDir ||
        join(support, profile === "claude-3p" ? "Claude-3p" : "Claude"),
      "claude_desktop_config.json"
    ),
    stateFile: join(root, "setup-state.json"),
  };
}

function entryFor(runtime) {
  return {
    command: "node",
    args: [join(runtime, "dist-server", "main.js"), "--stdio"],
  };
}

const digest = (file) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");

export function inspectDesktopSetup(options) {
  const location = paths(options);
  for (const file of artifacts) {
    if (!existsSync(join(options.bundleRoot, file)))
      throw new Error(
        "The complete dashboard bundle is required. Install the updated plugin."
      );
  }
  const config = readConfig(location.config);
  const expectedMode = options.profile === "claude-3p" ? "3p" : "1p";
  if (config.deploymentMode && config.deploymentMode !== expectedMode)
    throw new Error(
      "The selected config belongs to another Claude profile."
    );
  const entry = entryFor(location.runtime);
  let moduleRuntime = false;
  try {
    moduleRuntime =
      readJson(join(location.runtime, "package.json"), {}).type ===
      "module";
  } catch {}
  const installed =
    moduleRuntime &&
    isDeepStrictEqual(config.mcpServers?.[serverName], entry) &&
    artifacts.every((source) => {
      const file = join(location.runtime, source);
      return (
        existsSync(file) &&
        digest(file) === digest(join(options.bundleRoot, source))
      );
    });
  return { ...location, entry, installed };
}

function jobExists(label) {
  try {
    execFileSync("/bin/launchctl", ["list", label], {
      stdio: "ignore",
      timeout: 5000,
    });
    return true;
  } catch (error) {
    if (error.status) return false;
    throw error;
  }
}

function removeJob(label) {
  try {
    execFileSync("/bin/launchctl", ["remove", label], {
      stdio: "ignore",
      timeout: 5000,
    });
  } catch {}
}

function submitJob(task) {
  execFileSync(
    "/bin/launchctl",
    [
      "submit",
      "-l",
      task.label,
      "-o",
      join(task.root, "setup.log"),
      "-e",
      join(task.root, "setup.log"),
      "--",
      task.node,
      join(task.stage, "desktop-setup-worker.mjs"),
      join(task.stage, "task.json"),
    ],
    { timeout: 10000, stdio: ["ignore", "pipe", "pipe"] }
  );
  if (!jobExists(task.label))
    throw new Error("The independent setup helper could not be started.");
}

export function prepareDesktopSetup(options, system = {}) {
  if ((options.platform || process.platform) !== "darwin")
    throw new Error("Claude Desktop setup currently supports macOS.");
  const location = inspectDesktopSetup(options);
  const resume = workflowResume(options);
  if (location.installed)
    return {
      status: "configured",
      config: location.config,
      message: "Das Dashboard ist bereits eingerichtet.",
    };
  mkdirSync(location.root, { recursive: true });
  const lock = join(location.root, "prepare.lock");
  if (existsSync(lock) && Date.now() - statSync(lock).mtimeMs > 30000)
    rmSync(lock, { recursive: true, force: true });
  try {
    mkdirSync(lock);
  } catch (error) {
    if (error.code === "EEXIST")
      throw new Error(
        "Dashboard setup is already being prepared; try again shortly."
      );
    throw error;
  }
  try {
    const previous = readJson(location.stateFile, null);
    const exists = system.jobExists || jobExists;
    if (
      previous?.status === "waiting-for-quit" &&
      previous.expiresAt > Date.now() &&
      exists(previous.label)
    ) {
      if (previous.config !== location.config)
        throw new Error(
          "A setup for another Claude data directory is still pending."
        );
      if (!isDeepStrictEqual(previous.resume, resume))
        throw new Error(
          "A different workflow is already waiting for Claude to quit. Finish that setup first."
        );
      return pendingResult(location.config, previous.resume);
    }
    const applications = (system.runningClaude || runningClaude)();
    if (applications.length !== 1 || !applications[0].identity)
      throw new Error(
        "Expected one running Claude Desktop application. No restart has been scheduled."
      );
    const app = applications[0];
    const task = {
      ...location,
      ...app,
      profile: options.profile,
      resume,
      node: options.node || process.execPath,
      userDataDir:
        options.userDataDir ?? process.env.CLAUDE_USER_DATA_DIR,
      stage: join(location.root, "pending", randomUUID()),
      label: `org.ui5.dashboard-setup.${process.getuid()}.${options.profile}.${randomUUID()}`,
      expiresAt: Date.now() + 30 * 60 * 1000,
    };
    try {
      for (const file of artifacts) {
        const destination = join(task.stage, file);
        mkdirSync(dirname(destination), { recursive: true });
        copyFileSync(join(options.bundleRoot, file), destination);
      }
      writeAtomic(join(task.stage, "task.json"), JSON.stringify(task));
      if (previous?.label && exists(previous.label))
        (system.removeJob || removeJob)(previous.label);
      if (
        previous?.stage &&
        dirname(previous.stage) === join(location.root, "pending")
      )
        rmSync(previous.stage, { recursive: true, force: true });
      writeState(task, "waiting-for-quit");
      ;(system.submitJob || submitJob)(task);
    } catch (error) {
      ;(system.removeJob || removeJob)(task.label);
      writeState(task, "failed", { error: error.message });
      rmSync(task.stage, { recursive: true, force: true });
      throw error;
    }
    return pendingResult(task.config, task.resume);
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

export function installAfterQuit(task) {
  const original = existsSync(task.config)
    ? readFileSync(task.config, "utf8")
    : null;
  const config = readConfig(task.config);
  const expectedMode = task.profile === "claude-3p" ? "3p" : "1p";
  if (config.deploymentMode && config.deploymentMode !== expectedMode)
    throw new Error(
      "Claude changed profiles during setup. The config has not been changed."
    );
  for (const file of artifacts) {
    writeAtomic(
      join(task.runtime, file),
      readFileSync(join(task.stage, file)),
      0o600
    );
  }
  writeAtomic(
    join(task.runtime, "package.json"),
    JSON.stringify({ type: "module" })
  );
  const entry = entryFor(task.runtime);
  if (isDeepStrictEqual(config.mcpServers?.[serverName], entry)) return;
  config.mcpServers = { ...config.mcpServers, [serverName]: entry };
  const current = existsSync(task.config)
    ? readFileSync(task.config, "utf8")
    : null;
  if (current !== original)
    throw new Error(
      "The config changed during setup. Run dashboard setup again."
    );
  const mode = original === null ? 0o600 : statSync(task.config).mode & 0o777;
  if (original !== null)
    writeAtomic(
      `${task.config}.ui5-dashboard-${randomUUID()}.bak`,
      original
    );
  writeAtomic(
    task.config,
    JSON.stringify(config, null, 2) + String.fromCharCode(10),
    mode
  );
  if (
    !isDeepStrictEqual(
      readConfig(task.config).mcpServers[serverName],
      entry
    )
  )
    throw new Error("Dashboard registration could not be verified.");
}

export function reopenArguments(task) {
  const args = ["-a", task.appPath];
  if (task.resume) args.push(task.resume.url);
  if (task.userDataDir)
    args.push("--env", `CLAUDE_USER_DATA_DIR=${task.userDataDir}`);
  return args;
}

function reopenClaude(task) {
  const args = reopenArguments(task);
  execFileSync("/usr/bin/open", args, { timeout: 10000, stdio: "ignore" });
}

export async function completeDesktopSetup(task, system = {}) {
  try {
    const identity = system.processIdentity || processIdentity;
    while (identity(task.pid) === task.identity) {
      if (Date.now() >= task.expiresAt) {
        writeState(task, "expired");
        return;
      }
      await (system.sleep || sleep)(500);
    }
    if (Date.now() >= task.expiresAt) {
      writeState(task, "expired");
      return;
    }
    if ((system.runningClaude || runningClaude)().length)
      throw new Error(
        "Claude was reopened before setup finished. The config has not been changed; run setup again."
      );
    installAfterQuit(task);
    writeState(task, "registered");
    ;(system.reopenClaude || reopenClaude)(task);
    writeState(task, "reopened");
  } catch (error) {
    writeState(task, "failed", { error: error.message });
    throw error;
  } finally {
    rmSync(task.stage, { recursive: true, force: true });
    ;(system.removeJob || removeJob)(task.label);
  }
}
