import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer, type CallToolResult, type ReadResourceResult } from "@modelcontextprotocol/server";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const SERVER_FILE = fileURLToPath(import.meta.url);
const PROJECT_DIR = SERVER_FILE.endsWith(".ts")
  ? path.dirname(SERVER_FILE)
  : path.resolve(path.dirname(SERVER_FILE), "..");
const DIST_DIR = path.join(PROJECT_DIR, "dist");

const STATE_FILE = "/tmp/ui5-modernization-state.json";
const resourceUri = "ui://ui5-modernization/mcp-app.html";

async function readState(): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(STATE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeState(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  const existing = await readState() ?? {};
  const isNewRun = !existing.startedAt || existing.status === "idle"
    || (patch.status === "running" && existing.status !== "running");
  if (isNewRun) {
    const merged = { ...patch };
    await fs.writeFile(STATE_FILE, JSON.stringify(merged, null, 2), "utf-8");
    return merged;
  }
  const merged = { ...existing, ...patch, startedAt: existing.startedAt };
  await fs.writeFile(STATE_FILE, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: "UI5 Modernization",
    version: "1.0.0",
  });

  // Tool: open the dashboard (and return current state)
  registerAppTool(
    server,
    "get-status",
    {
      title: "UI5 Modernization",
      description: "Show the UI5 modernization progress dashboard.",
      inputSchema: z.object({}),
      outputSchema: z.object({}).passthrough(),
      _meta: { ui: { resourceUri } },
    },
    async (): Promise<CallToolResult> => {
      const state = await readState();
      return {
        content: [{ type: "text", text: state ? `Status: ${(state as any).status}` : "No run active." }],
        structuredContent: state ?? { status: "idle" },
      };
    },
  );

  // Tool: update-status — called by the modernization agent to push live progress
  registerAppTool(
    server,
    "update-status",
    {
      title: "Update Modernization Status",
      description:
        "Push a progress update from the modernization agent into the dashboard. " +
        "Pass a partial ModernizationState object; it is merged with existing state.",
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.object({}).passthrough(),
      _meta: { ui: { resourceUri } },
    },
    async (args: Record<string, unknown>): Promise<CallToolResult> => {
      const merged = await writeState(args);
      return {
        content: [{ type: "text", text: `Status updated: ${(merged as any).status ?? "unknown"}` }],
        structuredContent: merged,
      };
    },
  );

  // Tool: reset-status — wipe the state back to idle
  registerAppTool(
    server,
    "reset-status",
    {
      title: "Reset Dashboard",
      description: "Reset the modernization dashboard to idle state, clearing all progress.",
      inputSchema: z.object({}),
      outputSchema: z.object({}).passthrough(),
      _meta: { ui: { resourceUri } },
    },
    async (): Promise<CallToolResult> => {
      await fs.writeFile(STATE_FILE, JSON.stringify({ status: "idle" }, null, 2), "utf-8");
      return {
        content: [{ type: "text", text: "Dashboard reset to idle." }],
        structuredContent: { status: "idle" },
      };
    },
  );

  // Tool: get-file — read a markdown file by absolute path and return its content
  registerAppTool(
    server,
    "get-file",
    {
      title: "Get File Content",
      description: "Read a file (e.g. MODERNIZATION-REPORT.md) by absolute path and return its text content.",
      inputSchema: z.object({ path: z.string() }),
      outputSchema: z.object({ content: z.string(), filename: z.string() }),
      _meta: { ui: { resourceUri } },
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
