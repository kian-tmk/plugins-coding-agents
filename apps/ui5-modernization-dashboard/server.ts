import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer, type CallToolResult, type ReadResourceResult } from "@modelcontextprotocol/server";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { prepareDesktopSetup } from "./desktop-setup.mjs";
import { stateSchema, updateSchema } from "./state-schema.js";
import { readState, saveState, STATE_FILE } from "./state-store.js";

const SERVER_FILE = fileURLToPath(import.meta.url);
const PROJECT_DIR = SERVER_FILE.endsWith(".ts")
  ? path.dirname(SERVER_FILE)
  : path.resolve(path.dirname(SERVER_FILE), "..");
const DIST_DIR = path.join(PROJECT_DIR, "dist");

const resourceUri = "ui://ui5-modernization/mcp-app.html";

async function writeState(stateFile: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  const existing = await readState(stateFile) ?? {};
  const isNewRun = !existing.startedAt || existing.status === "idle"
    || (patch.status === "running" && existing.status !== "running");
  const now = new Date().toISOString();
  // Clocks describe received workflow events, not dates guessed by the agent.
  const { startedAt: _started, phaseStartedAt: _phase, completedAt: _completed, ...fields } = patch;
  const merged: Record<string, unknown> = isNewRun
    ? { ...fields, startedAt: now }
    : { ...existing, ...fields, startedAt: existing.startedAt };
  const phaseChanged = fields.currentPhase !== undefined
    && (isNewRun || fields.currentPhase !== existing.currentPhase);
  if (phaseChanged) merged.phaseStartedAt = Number(fields.currentPhase) > 0 ? now : null;
  if (fields.status === "completed" && existing.status !== "completed") merged.completedAt = now;

  // Derive counters from phases when the agent didn't push them explicitly.
  const phases = Array.isArray(merged.phases) ? merged.phases as Record<string, unknown>[] : [];
  const baseline = typeof merged.totalFindings === "number" ? merged.totalFindings as number
    : typeof merged.linterBaseline === "number" ? merged.linterBaseline as number : 0;
  if (baseline > 0 && phases.length > 0) {
    const completedPhases = phases.filter(p => p.status === "completed" && typeof p.findingsAfter === "number");
    if (completedPhases.length > 0) {
      const lastCompleted = completedPhases[completedPhases.length - 1];
      const remaining = lastCompleted.findingsAfter as number;
      const fixed = baseline - remaining;
      if (fields.findingsFixed === undefined && fixed > (merged.findingsFixed as number ?? 0))
        merged.findingsFixed = fixed;
      if (fields.findingsRemaining === undefined && remaining < (merged.findingsRemaining as number ?? baseline))
        merged.findingsRemaining = remaining;
      if (fields.overallProgress === undefined) {
        const derived = Math.round((fixed / baseline) * 100);
        if (derived > (merged.overallProgress as number ?? 0))
          merged.overallProgress = derived;
      }
    }
  }

  await saveState(merged, stateFile);
  return merged;
}

export function createServer({ enableDesktopSetup = false, stateFile = STATE_FILE } = {}): McpServer {
  const server = new McpServer({
    name: "UI5 Modernization",
    version: "1.0.0",
  });

  // Setup works through plugin registration even when inline rendering is unavailable.
  if (enableDesktopSetup) server.registerTool(
    "setup-desktop-dashboard",
    {
      title: "Set Up Dashboard in Claude Desktop",
      description: "Prepare the inline dashboard in the active macOS Claude Desktop profile. Call only when the user requests dashboard setup. A helper waits for the user to quit Claude, registers the bundled server, and reopens Claude. It never quits Claude itself.",
      inputSchema: z.object({
        profile: z.enum(["claude", "claude-3p"]),
        projectPath: z.string().optional().describe("Absolute current project directory. Pass only when pausing the modernization workflow in Phase 0 before changes; reopens a new Code chat with a continuation draft. The user must click Send."),
        resumeContext: z.string().max(2000).optional().describe("Previously agreed user constraints, including any verification mode or non-interactive request. Requires projectPath."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ profile, projectPath, resumeContext }) => {
      try {
        const result = prepareDesktopSetup({ profile, bundleRoot: PROJECT_DIR, projectPath, resumeContext });
        return { content: [{ type: "text", text: result.message }], structuredContent: result };
      } catch (error) {
        return { content: [{ type: "text", text: `Dashboard setup failed: ${(error as Error).message}` }], isError: true };
      }
    },
  );

  const statusResult = async (): Promise<CallToolResult> => {
    const state = await readState(stateFile);
    return {
      content: [{ type: "text", text: state ? `Status: ${state.status}` : "No run active." }],
      structuredContent: state ?? { status: "idle" },
    };
  };

  // Only this explicit tool opens a widget. Data tools must not carry a UI resource.
  // Each call rotates the viewId so previous widgets detect they are stale and tear down.
  registerAppTool(
    server,
    "open-dashboard",
    {
      title: "UI5 Modernization",
      description: "Open the inline UI5 modernization dashboard. Call once during setup, or when the user explicitly asks to reopen it. The existing widget polls get-status for live updates. Use get-status for later status checks.",
      inputSchema: z.object({}),
      outputSchema: stateSchema,
      _meta: { ui: { resourceUri } },
    },
    async (): Promise<CallToolResult> => {
      const state = await readState(stateFile) ?? {};
      const viewId = randomUUID();
      await saveState({ ...state, viewId }, stateFile);
      return {
        content: [{ type: "text", text: state.status ? `Status: ${state.status}` : "No run active." }],
        structuredContent: { ...state, viewId },
      };
    },
  );

  server.registerTool(
    "get-status",
    {
      title: "Get Modernization Status",
      description: "Read current modernization status without opening a widget. Used by the existing dashboard for polling and by the agent for status checks.",
      inputSchema: z.object({}),
      outputSchema: stateSchema,
      annotations: { readOnlyHint: true },
    },
    statusResult,
  );

  // Tool: update-status — called by the modernization agent to push live progress
  server.registerTool(
    "update-status",
    {
      title: "Update Modernization Status",
      description:
        "Push a progress update from the modernization agent into the dashboard. " +
        "Pass a partial ModernizationState object; it is merged with existing state. Updates the existing widget without opening another one.",
      inputSchema: updateSchema,
      outputSchema: stateSchema,
    },
    async (args: Record<string, unknown>): Promise<CallToolResult> => {
      const merged = await writeState(stateFile, args);
      return {
        content: [{ type: "text", text: `Status updated: ${(merged as any).status ?? "unknown"}` }],
        structuredContent: merged,
      };
    },
  );

  // Tool: reset-status — wipe the state back to idle
  server.registerTool(
    "reset-status",
    {
      title: "Reset Dashboard",
      description: "Reset the modernization dashboard to idle state, clearing all progress.",
      inputSchema: z.object({}),
      outputSchema: stateSchema,
    },
    async (): Promise<CallToolResult> => {
      await saveState({ status: "idle" }, stateFile);
      return {
        content: [{ type: "text", text: "Dashboard reset to idle." }],
        structuredContent: { status: "idle" },
      };
    },
  );

  // Tool: get-file — read a markdown file by absolute path and return its content
  server.registerTool(
    "get-file",
    {
      title: "Get File Content",
      description: "Read a file (e.g. MODERNIZATION-REPORT.md) by absolute path and return its text content.",
      inputSchema: z.object({ path: z.string() }),
      outputSchema: z.object({ content: z.string(), filename: z.string() }),
    },
    async (args: { path: string }): Promise<CallToolResult> => {
      const filePath = args.path;
      // Safety: only allow reading markdown files, no path traversal
      const normalized = path.resolve(filePath);
      if (!normalized.endsWith(".md")) {
        return {
          content: [{ type: "text", text: "Only .md files are supported." }],
          structuredContent: { content: "", filename: "" },
          isError: true,
        };
      }
      try {
        const content = await fs.readFile(normalized, "utf-8");
        const filename = path.basename(normalized);
        return {
          content: [{ type: "text", text: `File: ${filename} (${content.length} chars)` }],
          structuredContent: { content, filename },
        };
      } catch {
        return {
          content: [{ type: "text", text: `File not found: ${normalized}` }],
          structuredContent: { content: "", filename: path.basename(filePath) },
          isError: true,
        };
      }
    },
  );

  // Resource: the UI HTML
  registerAppResource(
    server,
    resourceUri,
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE },
    async (): Promise<ReadResourceResult> => {
      const html = await fs.readFile(path.join(DIST_DIR, "mcp-app.html"), "utf-8");
      return {
        contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html }],
      };
    },
  );

  return server;
}
