import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { createServer } from "./server.js";

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
  assert.deepEqual(opened.structuredContent, { status: "idle" });
  const startedAt = "2026-11-02T12:00:00.000Z";
  let serverStartedAt: unknown;
  for (let progress = 1; progress <= 20; progress++) {
    const updated = await client.callTool({
      name: "update-status",
      arguments: { status: "running", overallProgress: progress, startedAt },
    });
    const polled = await client.callTool({ name: "get-status", arguments: {} });
    assert.deepEqual(polled.structuredContent, updated.structuredContent);
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
  assert.deepEqual((await client.callTool({ name: "get-status", arguments: {} })).structuredContent, { status: "idle" });
  assert.equal(reset._meta?.ui, undefined);
  const rejected = await client.callTool({ name: "update-status", arguments: {} });
  assert.equal(rejected.isError, true);
  const rejectedClock = await client.callTool({
    name: "update-status", arguments: { startedAt },
  });
  assert.equal(rejectedClock.isError, true);
  assert.deepEqual(JSON.parse(await readFile(path.join(directory, "state.json"), "utf8")), { status: "idle" });
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
  const expected = { ...payload, startedAt: result.structuredContent?.startedAt, phaseStartedAt: result.structuredContent?.phaseStartedAt };
  assert.notEqual(expected.startedAt, payload.startedAt);
  assert.equal(expected.phaseStartedAt, expected.startedAt);
  assert.deepEqual(declaredProperties(result.structuredContent, update.outputSchema), expected);
  const polled = await widget.callTool({ name: "get-status", arguments: {} });
  assert.deepEqual(declaredProperties(polled.structuredContent, get.outputSchema), expected);
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
