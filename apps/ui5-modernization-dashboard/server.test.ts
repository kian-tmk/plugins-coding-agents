import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { createServer } from "./server.js";

const execFileAsync = promisify(execFile);

// Build a throwaway git repo: initial commit on <main>, then a work branch with one extra commit.
async function makeRepo(dir: string): Promise<{ originalBranch: string; workBranch: string }> {
  const git = (args: string[]) => execFileAsync("git", args, { cwd: dir });
  await git(["init", "-q"]);
  await git(["config", "user.email", "test@example.com"]);
  await git(["config", "user.name", "Test"]);
  await writeFile(path.join(dir, "app.js"), "// original\n");
  await git(["add", "-A"]);
  await git(["commit", "-q", "-m", "initial"]);
  const originalBranch = (await git(["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim();
  const workBranch = "ui5-modernization-test";
  await git(["checkout", "-q", "-b", workBranch]);
  await writeFile(path.join(dir, "app.js"), "// modernized\n");
  await git(["commit", "-q", "-am", "modernize"]);
  return { originalBranch, workBranch };
}

test("one explicit dashboard opening followed by 20 updates and polls exposes only one widget tool", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "ui5-widget-test-"));
  const server = createServer({ stateFile: path.join(directory, "state.json") });
  const client = new Client({ name: "widget-regression-test", version: "1.0.0" });
  t.after(async () => {
    await client.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const { tools } = await client.listTools();
  const resourceFor = (name: string) => {
    const meta = tools.find(tool => tool.name === name)?._meta;
    return (meta?.ui as { resourceUri?: string } | undefined)?.resourceUri
      ?? meta?.["ui/resourceUri"];
  };
  assert.deepEqual(tools.filter(tool => resourceFor(tool.name)).map(tool => tool.name), [
    "open-dashboard",
  ]);
  const opened = await client.callTool({ name: "open-dashboard", arguments: {} });
  assert.deepEqual(opened.structuredContent, { status: "idle", serverBuild: "dev" });
  const startedAt = "2026-11-02T12:00:00.000Z";
  let serverStartedAt: unknown;
  for (let progress = 1; progress <= 20; progress++) {
    const updated = await client.callTool({
      name: "update-status",
      arguments: { status: "running", overallProgress: progress, startedAt },
    });
    const polled = await client.callTool({ name: "get-status", arguments: {} });
    // get-status adds serverBuild (not persisted); update-status does not — compare without it.
    assert.deepEqual({ ...polled.structuredContent, serverBuild: undefined }, { ...updated.structuredContent, serverBuild: undefined });
    assert.equal(polled.structuredContent?.serverBuild, "dev");
    assert.equal(polled.structuredContent?.overallProgress, progress);
    serverStartedAt ??= polled.structuredContent?.startedAt;
    assert.equal(polled.structuredContent?.startedAt, serverStartedAt);
    assert.notEqual(serverStartedAt, startedAt);
    assert.equal(updated.isError, undefined);
    assert.equal(updated._meta?.ui, undefined);
    assert.equal(polled._meta?.ui, undefined);
  }
  const report = path.join(directory, "MODERNIZATION-REPORT.md");
  await writeFile(report, "# Report\nDone.");
  const file = await client.callTool({ name: "get-file", arguments: { path: report } });
  assert.equal(file.structuredContent?.content, "# Report\nDone.");
  assert.equal(file._meta?.ui, undefined);
  await client.callTool({ name: "update-status", arguments: { status: "completed" } });
  assert.equal((await client.callTool({ name: "get-status", arguments: {} })).structuredContent?.status, "completed");
  const reset = await client.callTool({ name: "reset-status", arguments: {} });
  assert.deepEqual(reset.structuredContent, { status: "idle" });
  assert.deepEqual((await client.callTool({ name: "get-status", arguments: {} })).structuredContent, { status: "idle", serverBuild: "dev" });
  assert.equal(reset._meta?.ui, undefined);
  const rejected = await client.callTool({ name: "update-status", arguments: {} });
  assert.equal(rejected.isError, true);
  const rejectedClock = await client.callTool({
    name: "update-status", arguments: { startedAt },
  });
  assert.equal(rejectedClock.isError, true);
  assert.deepEqual(JSON.parse(await readFile(path.join(directory, "state.json"), "utf8")), { status: "idle" });
});

test("early-run stage is tracked then cleared once phases arrive", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "ui5-stage-test-"));
  const server = createServer({ stateFile: path.join(directory, "state.json") });
  const client = new Client({ name: "stage-test", version: "1.0.0" });
  t.after(async () => {
    await client.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  await client.connect(ct);
  const get = async () => (await client.callTool({ name: "get-status", arguments: {} })).structuredContent as Record<string, any>;

  // "started" (dashboard opened) and "linting" (baseline running) are distinct,
  // explicit sub-states before any phases — this is what lets the dashboard tell
  // "Modernization started" from "Linter running".
  await client.callTool({ name: "update-status", arguments: { status: "running", stage: "started", project: "x", projectPath: "/x" } });
  assert.equal((await get()).stage, "started");
  await client.callTool({ name: "update-status", arguments: { status: "running", stage: "linting" } });
  assert.equal((await get()).stage, "linting");

  // After the linter, the skill pushes stage:"analyzed" while it builds the phases
  // array — the dashboard shows "Linter analysis completed" instead of an empty shell.
  await client.callTool({ name: "update-status", arguments: { status: "running", stage: "analyzed" } });
  assert.equal((await get()).stage, "analyzed");

  // The FIRST phases push sends every phase "pending" with currentPhase 0. stage must
  // SURVIVE this so the dashboard can keep the early screen until a phase truly starts
  // (otherwise the user sees an empty "Phase — of N" shell for ~1-2s).
  await client.callTool({ name: "update-status", arguments: { status: "running", currentPhase: 0, phases: [{ id: 1, name: "P1", status: "pending" }, { id: 2, name: "P2", status: "pending" }] } });
  assert.equal((await get()).stage, "analyzed", "stage survives a pending-only phases push");

  // Once a phase actually starts (running + currentPhase 1), the server drops stage so
  // the live phase view takes over.
  await client.callTool({ name: "update-status", arguments: { status: "running", currentPhase: 1, phases: [{ id: 1, name: "P1", status: "running" }] } });
  assert.equal((await get()).stage, null, "stage cleared once a phase is running");
});

test("stop-status marks the run stopped while preserving progress", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "ui5-stop-test-"));
  const server = createServer({ stateFile: path.join(directory, "state.json") });
  const client = new Client({ name: "stop-test", version: "1.0.0" });
  t.after(async () => {
    await client.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  // Push a mid-run state with remaining findings and phases.
  await client.callTool({
    name: "update-status",
    arguments: {
      status: "running", linterBaseline: 40, findingsFixed: 15, findingsRemaining: 25,
      currentPhase: 2, startedAt: "2026-11-02T12:00:00.000Z",
      phases: [{ id: 1, name: "Mechanical Baseline", status: "completed" }],
    },
  });

  const stopped = await client.callTool({ name: "stop-status", arguments: { reason: "User stopped" } });
  assert.equal(stopped.isError, undefined);

  const state = (await client.callTool({ name: "get-status", arguments: {} })).structuredContent as any;
  assert.equal(state.status, "stopped");
  assert.equal(state.stopReason, "User stopped");
  assert.ok(state.stoppedAt, "stoppedAt is set by the server");
  // Progress is preserved, not wiped like reset-status.
  assert.equal(state.findingsRemaining, 25);
  assert.equal(state.findingsFixed, 15);
  assert.equal(state.currentPhase, 2);
  assert.equal(state.phases.length, 1);
  // startedAt survives the stop.
  assert.notEqual(state.startedAt, undefined);

  // Stopping without a reason is allowed and leaves stopReason null.
  const directory2 = await mkdtemp(path.join(tmpdir(), "ui5-stop-test2-"));
  const server2 = createServer({ stateFile: path.join(directory2, "state.json") });
  const client2 = new Client({ name: "stop-test-2", version: "1.0.0" });
  t.after(async () => {
    await client2.close();
    await server2.close();
    await rm(directory2, { recursive: true, force: true });
  });
  const [ct2, st2] = InMemoryTransport.createLinkedPair();
  await server2.connect(st2);
  await client2.connect(ct2);
  await client2.callTool({ name: "update-status", arguments: { status: "running", linterBaseline: 10 } });
  await client2.callTool({ name: "stop-status", arguments: {} });
  const state2 = (await client2.callTool({ name: "get-status", arguments: {} })).structuredContent as any;
  assert.equal(state2.status, "stopped");
  assert.equal(state2.stopReason, null);
});

test("request-stop sets the flag without ending the run, then stop-status finalizes", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "ui5-reqstop-test-"));
  const server = createServer({ stateFile: path.join(directory, "state.json") });
  const client = new Client({ name: "request-stop-test", version: "1.0.0" });
  t.after(async () => {
    await client.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  // Mid-run state, as the agent would push it.
  await client.callTool({
    name: "update-status",
    arguments: {
      status: "running", linterBaseline: 40, findingsFixed: 15, findingsRemaining: 25,
      currentPhase: 2, startedAt: "2026-11-02T12:00:00.000Z",
      phases: [{ id: 1, name: "Mechanical Baseline", status: "completed" }],
    },
  });

  // The dashboard Stop button → request-stop: flag is set, run stays "running".
  const requested = await client.callTool({ name: "request-stop", arguments: {} });
  assert.equal(requested.isError, undefined);
  const afterRequest = (requested.structuredContent as any);
  assert.equal(afterRequest.stopRequested, true, "request-stop sets the flag");
  assert.equal(afterRequest.status, "running", "request-stop does NOT change status");
  assert.equal(afterRequest.findingsRemaining, 25, "progress preserved");

  // The agent reads the flag back from its next update-status call (the merged state).
  const nextPush = await client.callTool({ name: "update-status", arguments: { currentActivity: "still working" } });
  assert.equal((nextPush.structuredContent as any).stopRequested, true,
    "the agent sees stopRequested in the update-status return value");

  // request-stop is idempotent.
  const again = await client.callTool({ name: "request-stop", arguments: {} });
  assert.equal((again.structuredContent as any).stopRequested, true);
  assert.equal((again.structuredContent as any).status, "running");

  // Then the agent calls stop-status to finalize: status flips, flag stays true.
  await client.callTool({ name: "stop-status", arguments: { reason: "Stopped by user from dashboard" } });
  const final = (await client.callTool({ name: "get-status", arguments: {} })).structuredContent as any;
  assert.equal(final.status, "stopped");
  assert.equal(final.stopReason, "Stopped by user from dashboard");
  assert.equal(final.stopRequested, true, "flag stays coherent through finalize");
  assert.equal(final.findingsRemaining, 25, "progress preserved through the whole flow");
  assert.ok(final.stoppedAt, "stoppedAt set on finalize");
});

test("a new run clears a stale stopRequested flag", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "ui5-reqstop-clear-"));
  const server = createServer({ stateFile: path.join(directory, "state.json") });
  const client = new Client({ name: "request-stop-clear-test", version: "1.0.0" });
  t.after(async () => {
    await client.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  // A finished-and-stopped run leaves stopRequested true.
  await client.callTool({ name: "update-status", arguments: { status: "running", linterBaseline: 10, startedAt: "2026-11-02T12:00:00.000Z" } });
  await client.callTool({ name: "stop-status", arguments: {} });
  assert.equal((await client.callTool({ name: "get-status", arguments: {} })).structuredContent?.stopRequested, true);

  // Starting a fresh run straight from the stopped state (status stopped→running, no
  // reset in between) must not inherit the old flag — this is the real stale path.
  await client.callTool({ name: "update-status", arguments: { status: "running", stage: "started", project: "y", projectPath: "/y" } });
  const fresh = (await client.callTool({ name: "get-status", arguments: {} })).structuredContent as any;
  assert.equal(fresh.status, "running");
  assert.notEqual(fresh.stopRequested, true, "the new run starts without a stale stop request");
});

test("reset-app switches the repo back to the original branch and keeps the work branch", async (t) => {
  const repo = await mkdtemp(path.join(tmpdir(), "ui5-reset-repo-"));
  const stateDir = await mkdtemp(path.join(tmpdir(), "ui5-reset-state-"));
  const stateFile = path.join(stateDir, "state.json");
  const { originalBranch, workBranch } = await makeRepo(repo);

  const server = createServer({ stateFile });
  const client = new Client({ name: "reset-test", version: "1.0.0" });
  t.after(async () => {
    await client.close();
    await server.close();
    await rm(repo, { recursive: true, force: true });
    await rm(stateDir, { recursive: true, force: true });
  });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  await client.connect(ct);

  // Seed a stopped run that recorded the branches.
  await client.callTool({
    name: "update-status",
    arguments: { status: "running", projectPath: repo, originalBranch, workBranch, linterBaseline: 10 },
  });
  await client.callTool({ name: "stop-status", arguments: {} });

  const git = (args: string[]) => execFileAsync("git", args, { cwd: repo });
  assert.equal((await git(["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim(), workBranch, "starts on work branch");

  const reset = await client.callTool({ name: "reset-app", arguments: {} });
  assert.notEqual(reset.isError, true);

  // Repo is back on the original branch, with the original file contents.
  assert.equal((await git(["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim(), originalBranch);
  assert.equal(await readFile(path.join(repo, "app.js"), "utf8"), "// original\n");
  // Work branch is preserved as the backup.
  const branches = (await git(["branch", "--list", workBranch])).stdout.trim();
  assert.ok(branches.includes(workBranch), "work branch kept as backup");
  // Dashboard is idle again.
  const afterReset = (await client.callTool({ name: "get-status", arguments: {} })).structuredContent as Record<string, any>;
  assert.equal(afterReset?.status, "idle");
  // The reset is recorded persistently so the confirmation survives a reload / 2nd tab.
  assert.equal(afterReset?.lastOutcome?.kind, "reset", "lastOutcome records a plain reset");
  assert.equal(afterReset?.lastOutcome?.originalBranch, originalBranch);
  assert.equal(afterReset?.lastOutcome?.workBranch, workBranch);
});

test("reset-app refuses cleanly when no branches were recorded", async (t) => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "ui5-reset-none-"));
  const stateFile = path.join(stateDir, "state.json");
  const server = createServer({ stateFile });
  const client = new Client({ name: "reset-none-test", version: "1.0.0" });
  t.after(async () => {
    await client.close();
    await server.close();
    await rm(stateDir, { recursive: true, force: true });
  });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  await client.connect(ct);

  await client.callTool({ name: "update-status", arguments: { status: "stopped", linterBaseline: 5 } });
  const reset = await client.callTool({ name: "reset-app", arguments: {} });
  assert.equal(reset.isError, true);
  // State untouched — still stopped, not forced to idle on a refusal.
  assert.equal((await client.callTool({ name: "get-status", arguments: {} })).structuredContent?.status, "stopped");
});

test("merge-app merges work branch into original", async (t) => {
  const repo = await mkdtemp(path.join(tmpdir(), "ui5-merge-repo-"));
  const stateDir = await mkdtemp(path.join(tmpdir(), "ui5-merge-state-"));
  const stateFile = path.join(stateDir, "state.json");
  const { originalBranch, workBranch } = await makeRepo(repo);

  const server = createServer({ stateFile });
  const client = new Client({ name: "merge-test", version: "1.0.0" });
  t.after(async () => {
    await client.close();
    await server.close();
    await rm(repo, { recursive: true, force: true });
    await rm(stateDir, { recursive: true, force: true });
  });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  await client.connect(ct);

  // Seed a completed run with all gates passed.
  await client.callTool({
    name: "update-status",
    arguments: {
      status: "running", projectPath: repo, originalBranch, workBranch, linterBaseline: 10,
      findingsFixed: 10, findingsRemaining: 0,
      phases: [{ id: 1, name: "Phase 1", status: "completed", gateStatus: "passed" }],
    },
  });
  await client.callTool({ name: "update-status", arguments: { status: "completed" } });

  const git = (args: string[]) => execFileAsync("git", args, { cwd: repo });
  assert.equal((await git(["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim(), workBranch, "starts on work branch");

  const merge = await client.callTool({ name: "merge-app", arguments: {} });
  assert.notEqual(merge.isError, true);

  // Repo is now on the original branch, with the modernized content (merged).
  assert.equal((await git(["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim(), originalBranch);
  assert.equal(await readFile(path.join(repo, "app.js"), "utf8"), "// modernized\n");
  // The merge commit exists (--no-ff creates a merge commit even for fast-forward).
  const log = (await git(["log", "--oneline", "-1"])).stdout;
  assert.ok(log.includes("modernize UI5 app"), `merge commit message: ${log.trim()}`);
  // State reflects the merge.
  const state = (await client.callTool({ name: "get-status", arguments: {} })).structuredContent as any;
  assert.equal(state.mergeStatus, "merged");
  assert.ok(state.mergedAt, "mergedAt is set");
  assert.equal(state.status, "completed", "status stays completed, not idle");
});

test("merge-app refuses when gates failed", async (t) => {
  const repo = await mkdtemp(path.join(tmpdir(), "ui5-merge-fail-repo-"));
  const stateDir = await mkdtemp(path.join(tmpdir(), "ui5-merge-fail-state-"));
  const stateFile = path.join(stateDir, "state.json");
  const { originalBranch, workBranch } = await makeRepo(repo);

  const server = createServer({ stateFile });
  const client = new Client({ name: "merge-fail-test", version: "1.0.0" });
  t.after(async () => {
    await client.close();
    await server.close();
    await rm(repo, { recursive: true, force: true });
    await rm(stateDir, { recursive: true, force: true });
  });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  await client.connect(ct);

  await client.callTool({
    name: "update-status",
    arguments: {
      status: "running", projectPath: repo, originalBranch, workBranch, linterBaseline: 10,
      phases: [{ id: 1, name: "Phase 1", status: "completed", gateStatus: "failed" }],
    },
  });
  await client.callTool({ name: "update-status", arguments: { status: "completed" } });

  const merge = await client.callTool({ name: "merge-app", arguments: {} });
  assert.equal(merge.isError, true);
  // Repo stays on the work branch.
  const git = (args: string[]) => execFileAsync("git", args, { cwd: repo });
  assert.equal((await git(["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim(), workBranch);
});

test("merge-app refuses when already merged", async (t) => {
  const repo = await mkdtemp(path.join(tmpdir(), "ui5-merge-dup-repo-"));
  const stateDir = await mkdtemp(path.join(tmpdir(), "ui5-merge-dup-state-"));
  const stateFile = path.join(stateDir, "state.json");
  const { originalBranch, workBranch } = await makeRepo(repo);

  const server = createServer({ stateFile });
  const client = new Client({ name: "merge-dup-test", version: "1.0.0" });
  t.after(async () => {
    await client.close();
    await server.close();
    await rm(repo, { recursive: true, force: true });
    await rm(stateDir, { recursive: true, force: true });
  });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  await client.connect(ct);

  await client.callTool({
    name: "update-status",
    arguments: {
      status: "running", projectPath: repo, originalBranch, workBranch, linterBaseline: 10,
      findingsFixed: 10, findingsRemaining: 0,
      phases: [{ id: 1, name: "Phase 1", status: "completed", gateStatus: "passed" }],
    },
  });
  await client.callTool({ name: "update-status", arguments: { status: "completed" } });

  // First merge succeeds.
  const first = await client.callTool({ name: "merge-app", arguments: {} });
  assert.notEqual(first.isError, true);

  // Second merge is refused.
  const second = await client.callTool({ name: "merge-app", arguments: {} });
  assert.equal(second.isError, true);
});

test("reset-app handles post-merge state", async (t) => {
  const repo = await mkdtemp(path.join(tmpdir(), "ui5-merge-reset-repo-"));
  const stateDir = await mkdtemp(path.join(tmpdir(), "ui5-merge-reset-state-"));
  const stateFile = path.join(stateDir, "state.json");
  const { originalBranch, workBranch } = await makeRepo(repo);

  const server = createServer({ stateFile });
  const client = new Client({ name: "merge-reset-test", version: "1.0.0" });
  t.after(async () => {
    await client.close();
    await server.close();
    await rm(repo, { recursive: true, force: true });
    await rm(stateDir, { recursive: true, force: true });
  });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  await client.connect(ct);

  await client.callTool({
    name: "update-status",
    arguments: {
      status: "running", projectPath: repo, originalBranch, workBranch, linterBaseline: 10,
      findingsFixed: 10, findingsRemaining: 0,
      phases: [{ id: 1, name: "Phase 1", status: "completed", gateStatus: "passed" }],
    },
  });
  await client.callTool({ name: "update-status", arguments: { status: "completed" } });
  await client.callTool({ name: "merge-app", arguments: {} });

  // After merge, we're on the original branch. Reset should just clear the dashboard.
  const git = (args: string[]) => execFileAsync("git", args, { cwd: repo });
  assert.equal((await git(["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim(), originalBranch);

  const reset = await client.callTool({ name: "reset-app", arguments: {} });
  assert.notEqual(reset.isError, true);
  const afterClear = (await client.callTool({ name: "get-status", arguments: {} })).structuredContent as Record<string, any>;
  assert.equal(afterClear?.status, "idle");
  // Post-merge clear records a distinct, persistent outcome for the idle screen.
  assert.equal(afterClear?.lastOutcome?.kind, "merged-cleared", "post-merge clear records merged-cleared");
  assert.equal(afterClear?.lastOutcome?.originalBranch, originalBranch);
});

// Reproduce hosts that retain only explicitly declared schema properties.
function declaredProperties(value: unknown, schema: any): any {
  if (schema?.anyOf) {
    const branch = schema.anyOf.find((candidate: any) => candidate.type === (value === null ? "null" : Array.isArray(value) ? "array" : typeof value));
    return declaredProperties(value, branch);
  }
  if (Array.isArray(value)) return value.map(item => declaredProperties(item, schema?.items));
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).filter(([key]) => key in (schema?.properties ?? {}))
      .map(([key, item]) => [key, declaredProperties(item, schema.properties[key])]),
  );
  return value;
}

test("declared status schemas survive host filtering and two stdio servers with different TMPDIR values share updates", async (t) => {
  const home = await mkdtemp(path.join(tmpdir(), "ui5-shared-state-test-"));
  const clients: Client[] = [];
  t.after(async () => {
    await Promise.all(clients.map(client => client.close()));
    await rm(home, { recursive: true, force: true });
  });
  for (const name of ["app", "plugin"]) {
    const temporary = path.join(home, name);
    await mkdir(temporary);
    const client = new Client({ name: `state-${name}-test`, version: "1.0.0" });
    clients.push(client);
    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", fileURLToPath(new URL("main.ts", import.meta.url)), "--stdio"],
      env: { ...env, HOME: home, TMPDIR: temporary },
      stderr: "pipe",
    }));
  }
  const [agent, widget] = clients;
  const { tools } = await agent.listTools();
  const update = tools.find(tool => tool.name === "update-status")!;
  const get = tools.find(tool => tool.name === "get-status")!;
  const phase = {
    id: 1, name: "Mechanical Baseline", description: "Autofix", status: "running",
    gateStatus: "idle", gateTestsPassed: null, gateTestsTotal: null,
    gateDurationSeconds: null, gateNote: null, findingsBefore: 8, findingsAfter: null,
    filesChanged: null, commit: null, commitMessage: null, skills: ["modernize-test-starter"], durationSeconds: null,
  };
  const payload = {
    status: "running", currentPhase: 1, currentActivity: "Applying autofix",
    project: "sample-app", projectPath: home, startedAt: "2026-11-02T12:49:29.743Z",
    findingsRemaining: 8, phases: [phase],
  };
  assert.deepEqual(declaredProperties(payload, update.inputSchema), payload);
  await widget.callTool({ name: "open-dashboard", arguments: {} });
  const result = await agent.callTool({ name: "update-status", arguments: declaredProperties(payload, update.inputSchema) });
  const expected = { ...payload, stage: null, startedAt: result.structuredContent?.startedAt, phaseStartedAt: result.structuredContent?.phaseStartedAt };
  assert.notEqual(expected.startedAt, payload.startedAt);
  assert.equal(expected.phaseStartedAt, expected.startedAt);
  assert.deepEqual(declaredProperties(result.structuredContent, update.outputSchema), expected);
  const polled = await widget.callTool({ name: "get-status", arguments: {} });
  // get-status augments the response with the server build string (not persisted).
  assert.equal((polled.structuredContent as any)?.serverBuild, "dev");
  assert.deepEqual(declaredProperties(polled.structuredContent, get.outputSchema), { ...expected, serverBuild: "dev" });
  assert.deepEqual(JSON.parse(await readFile(path.join(home, ".ui5-modernization-dashboard", "state.json"), "utf8")), expected);
  const gate = { ...phase, gateStatus: "passed", gateTestsPassed: 12, gateTestsTotal: 12, findingsAfter: 0 };
  await agent.callTool({ name: "update-status", arguments: { phases: [gate], findingsRemaining: 0 } });
  const latest = (await widget.callTool({ name: "get-status", arguments: {} })).structuredContent;
  assert.equal(latest?.status, "running");
  assert.equal(latest?.findingsRemaining, 0);
  assert.deepEqual(latest?.phases, [gate]);
  assert.equal(latest?.startedAt, expected.startedAt);
  assert.equal(latest?.phaseStartedAt, expected.phaseStartedAt);
  const phase2 = await agent.callTool({ name: "update-status", arguments: { currentPhase: 2, phaseStartedAt: "2026-11-02T00:01:00Z" } });
  assert.notEqual(phase2.structuredContent?.phaseStartedAt, "2026-11-02T00:01:00Z");
  assert.equal(phase2.structuredContent?.startedAt, expected.startedAt);
  const completed = await agent.callTool({ name: "update-status", arguments: { status: "completed", completedAt: "2026-11-02T00:02:00Z" } });
  assert.notEqual(completed.structuredContent?.completedAt, "2026-11-02T00:02:00Z");
  await agent.callTool({ name: "reset-status", arguments: {} });
  const restarted = await agent.callTool({ name: "update-status", arguments: payload });
  assert.notEqual(restarted.structuredContent?.startedAt, expected.startedAt);
  assert.equal(restarted.structuredContent?.phaseStartedAt, restarted.structuredContent?.startedAt);
});
