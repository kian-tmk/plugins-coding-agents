import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createMcpExpressApp } from "@modelcontextprotocol/express";
import type { McpServer } from "@modelcontextprotocol/server";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import cors from "cors";
import express from "express";
import type { Request, Response } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { marked } from "marked";
import { createServer } from "./server.js";

const execFileAsync = promisify(execFile);

const _SERVER_FILE = fileURLToPath(import.meta.url);
const PROJECT_DIR = _SERVER_FILE.endsWith(".ts")
  ? path.dirname(_SERVER_FILE)
  : path.resolve(path.dirname(_SERVER_FILE), "..");
const STATE_FILE = "/tmp/ui5-modernization-state.json";

// ── Git activity polling ──────────────────────────────────────────────────────

interface GitActivity {
  commits: Array<{ hash: string; message: string; ts: string }>;
  modifiedFiles: string[];
  lastPolledAt: string;
}

async function readState(): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await fs.readFile(STATE_FILE, "utf-8"));
  } catch { return null; }
}

async function getGitActivity(projectPath: string, sinceIso: string): Promise<GitActivity> {
  const opts = { cwd: projectPath };
  const modifiedFiles: string[] = [];
  const commits: GitActivity["commits"] = [];

  try {
    // Commits since the run started
    const { stdout: logOut } = await execFileAsync(
      "git", ["log", `--since=${sinceIso}`, "--pretty=format:%h\t%s\t%cI", "--no-merges"],
      { ...opts, timeout: 5000 }
    );
    for (const line of logOut.split("\n").filter(Boolean)) {
      const [hash, message, ts] = line.split("\t");
      if (hash) commits.push({ hash: hash.trim(), message: (message ?? "").trim(), ts: (ts ?? "").trim() });
    }
  } catch { /* git not available or not a repo */ }

  try {
    // Currently modified (staged + unstaged) files — shows live work in progress
    const { stdout: statusOut } = await execFileAsync(
      "git", ["diff", "--name-only", "HEAD"],
      { ...opts, timeout: 5000 }
    );
    for (const f of statusOut.split("\n").filter(Boolean)) modifiedFiles.push(f.trim());
    // Also untracked new files
    const { stdout: newOut } = await execFileAsync(
      "git", ["ls-files", "--others", "--exclude-standard"],
      { ...opts, timeout: 5000 }
    );
    for (const f of newOut.split("\n").filter(Boolean)) {
      if (!modifiedFiles.includes(f.trim())) modifiedFiles.push(f.trim());
    }
  } catch { /* ignore */ }

  return { commits, modifiedFiles, lastPolledAt: new Date().toISOString() };
}

let gitPollInterval: ReturnType<typeof setInterval> | null = null;

function startGitPolling() {
  if (gitPollInterval) return;
  gitPollInterval = setInterval(async () => {
    try {
      const state = await readState();
      if (!state || state.status !== "running" || !state.projectPath) return;
      const activity = await getGitActivity(
        state.projectPath as string,
        (state.startedAt as string) ?? new Date(0).toISOString()
      );
      // Track when we last saw real git activity (modified files or new commits)
      const hadActivity = activity.modifiedFiles.length > 0 || activity.commits.length > (state.gitActivity as any)?.commits?.length;
      const lastGitActivityAt = hadActivity
        ? new Date().toISOString()
        : (state.lastGitActivityAt as string | undefined) ?? new Date().toISOString();
      // Merge into state — only update gitActivity fields, never overwrite agent fields
      const updated = { ...state, gitActivity: activity, lastGitActivityAt };
      await fs.writeFile(STATE_FILE, JSON.stringify(updated, null, 2), "utf-8");
    } catch { /* non-fatal */ }
  }, 5000);
}

function stopGitPolling() {
  if (gitPollInterval) { clearInterval(gitPollInterval); gitPollInterval = null; }
}

async function startStreamableHTTPServer(
  factory: () => McpServer,
): Promise<void> {
  const port = parseInt(process.env.PORT ?? "3001", 10);
  const app = createMcpExpressApp({ host: "0.0.0.0" });
  app.use(cors());

  // Serve the built MCP app UI at root
  app.get("/", async (_req: Request, res: Response) => {
    const htmlPath = path.join(PROJECT_DIR, "dist", "mcp-app.html");
    res.sendFile(htmlPath);
  });

  // Serve report/issues files by filename — resolve path from state first,
  // fall back to modernization-history/ for backwards compat.
  app.get("/files/:filename", async (req: Request, res: Response) => {
    const filename = path.basename(String(req.params.filename));
    // Try to resolve the real path from state (reportPath / issuesPath)
    let filepath = path.join(PROJECT_DIR, "modernization-history", filename);
    try {
      const state = await readState();
      if (state) {
        // First try explicit paths from state
        const candidates = [state.reportPath, state.issuesPath].filter(Boolean) as string[];
        const match = candidates.find(p => path.basename(p as string) === filename);
        if (match) filepath = match as string;
        // Fall back: look in projectPath directly (agent wrote it there)
        else if (state.projectPath) {
          const projectFile = path.join(state.projectPath as string, filename);
          try { await fs.access(projectFile); filepath = projectFile; } catch { /* not there */ }
        }
      }
    } catch { /* fall back to default path */ }

    try {
      const content = await fs.readFile(filepath, "utf-8");
      if (filename.endsWith(".md")) {
        const html = await marked(content);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${filename}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 860px; margin: 40px auto; padding: 0 24px; background: #0d1117; color: #e6edf3; line-height: 1.6; }
  h1,h2,h3 { border-bottom: 1px solid #30363d; padding-bottom: 6px; }
  code { background: #21262d; border: 1px solid #30363d; border-radius: 4px; padding: 1px 5px; font-size: 0.9em; }
  pre { background: #21262d; border: 1px solid #30363d; border-radius: 6px; padding: 16px; overflow-x: auto; }
  pre code { background: none; border: none; padding: 0; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #30363d; padding: 8px 12px; text-align: left; }
  th { background: #161b22; }
  a { color: #388bfd; }
  blockquote { border-left: 3px solid #30363d; margin: 0; padding-left: 16px; color: #8b949e; }
</style>
</head><body>${html}</body></html>`);
      } else {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.send(content);
      }
    } catch {
      res.status(404).send("Not found");
    }
  });

  app.get("/api/status", async (_req: Request, res: Response) => {
    try {
      const raw = await fs.readFile(STATE_FILE, "utf-8");
      const state = JSON.parse(raw);
      // Kick off git polling if a run is active
      if (state?.status === "running") startGitPolling();
      res.json(state);
    } catch {
      res.json({ status: "idle" });
    }
  });

  // REST API: reset dashboard to idle
  app.post("/api/reset", async (_req: Request, res: Response) => {
    stopGitPolling();
    await fs.writeFile(STATE_FILE, JSON.stringify({ status: "idle" }, null, 2), "utf-8");
    res.json({ ok: true });
  });

  app.all("/mcp", async (req: Request, res: Response) => {
    const server = factory();
    const transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      // After any MCP call, check if we should start/stop git polling
      try {
        const state = await readState();
        if (state?.status === "running") startGitPolling();
        else stopGitPolling();
      } catch { /* non-fatal */ }
    } catch (error) {
      console.error("MCP error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  const httpServer = app.listen(port, async (err) => {
    if (err) {
      console.error("Failed to start server:", err);
      process.exit(1);
    }
    console.log(`UI5 Modernization MCP server listening on http://localhost:${port}/mcp`);
    // Resume git polling if a run was already active
    try {
      const state = await readState();
      if (state?.status === "running") startGitPolling();
    } catch { /* ignore */ }
  });

  const shutdown = () => {
    console.log("\nShutting down...");
    stopGitPolling();
    httpServer.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function startStdioServer(factory: () => McpServer): Promise<void> {
  await factory().connect(new StdioServerTransport());
}

async function main() {
  if (process.argv.includes("--stdio")) {
    await startStdioServer(createServer);
  } else {
    await startStreamableHTTPServer(createServer);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
