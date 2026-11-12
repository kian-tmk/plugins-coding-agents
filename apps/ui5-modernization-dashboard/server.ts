import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer, type CallToolResult, type ReadResourceResult } from "@modelcontextprotocol/server";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { z } from "zod";
import { prepareDesktopSetup } from "./desktop-setup.mjs";
import { stateSchema, updateSchema } from "./state-schema.js";
import { readState, saveState, STATE_FILE } from "./state-store.js";

const execFileAsync = promisify(execFile);

const SERVER_FILE = fileURLToPath(import.meta.url);
const PROJECT_DIR = SERVER_FILE.endsWith(".ts")
  ? path.dirname(SERVER_FILE)
  : path.resolve(path.dirname(SERVER_FILE), "..");
const DIST_DIR = path.join(PROJECT_DIR, "dist");

const resourceUri = "ui://ui5-modernization/mcp-app.html";

// Build identity injected by esbuild (see package.json "bundle"). Falls back to
// "dev" when run directly via tsx. Exposed through get-status as `serverBuild` so
// the UI can flag a stale runtime copy against its own __BUILD_VERSION__.
declare const __BUILD_VERSION__: string | undefined;
export const SERVER_BUILD = typeof __BUILD_VERSION__ !== "undefined" ? __BUILD_VERSION__ : "dev";

async function writeState(stateFile: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  const existing = await readState(stateFile) ?? {};
  // A run going running→running keeps its state; so does resuming paused→running (the
  // pause is a hold inside the SAME run, not a fresh start — otherwise resume would
  // reset startedAt and wipe accumulated progress). Everything else starting to run
  // (from idle/stopped/completed, or the very first push) is a new run.
  const resuming = patch.status === "running" && existing.status === "paused";
  const isNewRun = !resuming && (!existing.startedAt || existing.status === "idle"
    || (patch.status === "running" && existing.status !== "running"));
  const now = new Date().toISOString();
  // Clocks describe received workflow events, not dates guessed by the agent.
  const { startedAt: _started, phaseStartedAt: _phase, completedAt: _completed, stoppedAt: _stopped, mergedAt: _merged, ...fields } = patch;
  // A new run must not inherit a stale stopRequested flag from a previous (stopped) run.
  // Only clear it when one was actually set, so a clean first run stays free of the field.
  const clearStale = isNewRun && existing.stopRequested ? { stopRequested: null } : {};
  const merged: Record<string, unknown> = isNewRun
    ? { ...clearStale, ...fields, startedAt: now }
    : { ...existing, ...fields, startedAt: existing.startedAt };
  const phaseChanged = fields.currentPhase !== undefined
    && (isNewRun || fields.currentPhase !== existing.currentPhase);
  if (phaseChanged) merged.phaseStartedAt = Number(fields.currentPhase) > 0 ? now : null;
  if (fields.status === "completed" && existing.status !== "completed") merged.completedAt = now;
  if (fields.status === "stopped" && existing.status !== "stopped") merged.stoppedAt = now;

  // The early-run `stage` ("started"/"linting"/"analyzed") only applies before the
  // phase view exists. Drop it once a phase has ACTUALLY started — not merely once a
  // phases array exists. The first phases push sends every phase "pending"; keeping
  // `stage` through that lets the dashboard hold the "analyzed" screen (instead of an
  // empty phase shell) until Phase 1 flips to running. Clear it as soon as any phase
  // is running/completed/failed, or real progress shows.
  const mergedPhases = Array.isArray(merged.phases) ? merged.phases as Record<string, unknown>[] : [];
  const aPhaseStarted = mergedPhases.some(
    p => p.status === "running" || p.status === "completed" || p.status === "failed",
  ) || Number(merged.currentPhase ?? 0) >= 1;
  if (aPhaseStarted) {
    merged.stage = null;
  }

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

// When the modernization runs in a git worktree (Desktop "Use worktree" checkbox),
// projectPath is a linked worktree rather than the main checkout. Returns the root
// repo path in that case, or null for a normal checkout (or on any git error).
async function getWorktreeRoot(projectPath: string): Promise<string | null> {
  try {
    const gitDir = (await execFileAsync("git", ["rev-parse", "--git-dir"], { cwd: projectPath, timeout: 10000 })).stdout.trim();
    // Worktree git-dir looks like .../<root>/.git/worktrees/<name>; a normal repo is ".git".
    const marker = "/.git/worktrees/";
    const idx = gitDir.indexOf(marker);
    if (idx === -1) return null;
    return gitDir.slice(0, idx);
  } catch {
    return null;
  }
}

export interface ResetAppResult {
  ok: boolean;
  message: string;
}

// Switch back to the user's original branch, undoing the whole modernization run.
// The work branch is kept by default so nothing is lost — it is the backup.
// Shared by the reset-app MCP tool and the POST /api/reset-app route.
export async function resetApp(
  { removeWorkBranch = false, stateFile = STATE_FILE }: { removeWorkBranch?: boolean; stateFile?: string } = {},
): Promise<ResetAppResult> {
  const state = (await readState(stateFile)) ?? {};
  const projectPath = state.projectPath as string | undefined;
  const originalBranch = state.originalBranch as string | undefined;
  const workBranch = state.workBranch as string | undefined;

  if (!projectPath || !originalBranch || !workBranch) {
    return {
      ok: false,
      message: "Cannot reset: the run did not record a project path, original branch and work branch. "
        + "Nothing was changed in git.",
    };
  }

  const git = (args: string[]) => execFileAsync("git", args, { cwd: projectPath, timeout: 10000 });

  let current: string;
  try {
    current = (await git(["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim();
  } catch (error) {
    return { ok: false, message: `Cannot reset: not a git repository or git failed (${(error as Error).message}).` };
  }

  // Only act if we're still on the work branch — otherwise the user moved on, don't surprise them.
  if (current !== workBranch) {
    // After a merge, the repo is already on the original branch — just clear the dashboard.
    if (current === originalBranch && (state.mergeStatus as string | undefined) === "merged") {
      await saveState({
        status: "idle",
        lastOutcome: { kind: "merged-cleared", originalBranch, workBranch, at: new Date().toISOString() },
      }, stateFile);
      return { ok: true, message: `Already on '${originalBranch}' — the modernization was merged. Dashboard reset to idle.` };
    }
    return {
      ok: false,
      message: `Cannot reset: the repository is on '${current}', not the modernization branch '${workBranch}'. `
        + "Switch back manually if you intend to reset. Nothing was changed.",
    };
  }

  const worktreeRoot = await getWorktreeRoot(projectPath);

  try {
    // Discard all uncommitted changes from the modernization run before switching back.
    // The work is safely committed on the work branch — uncommitted leftovers are artifacts.
    await git(["checkout", "."]);
    await git(["clean", "-fd"]);
    if (worktreeRoot) {
      // In a worktree the "original branch" already lives in the root checkout, so there is
      // nothing to switch to here — just remove the worktree. The work branch stays as backup.
      await execFileAsync("git", ["-C", worktreeRoot, "worktree", "remove", projectPath], { timeout: 10000 });
    } else {
      await git(["checkout", originalBranch]);
    }
  } catch (error) {
    return { ok: false, message: `Cannot reset: failed to switch to '${originalBranch}' (${(error as Error).message}).` };
  }

  let note = worktreeRoot
    ? `Removed the modernization worktree at '${projectPath}'. Work is preserved on '${workBranch}'.`
    : `Switched back to '${originalBranch}'. Modernization work is preserved on '${workBranch}'.`;
  if (removeWorkBranch) {
    // After `worktree remove` the projectPath checkout is gone, so delete the branch
    // from the root repo; a normal checkout deletes it in place.
    const deleteBranch = worktreeRoot
      ? () => execFileAsync("git", ["-C", worktreeRoot, "branch", "-D", workBranch], { timeout: 10000 })
      : () => git(["branch", "-D", workBranch]);
    try {
      await deleteBranch();
      note = worktreeRoot
        ? `Removed the modernization worktree at '${projectPath}' and deleted the branch '${workBranch}'.`
        : `Switched back to '${originalBranch}' and deleted the modernization branch '${workBranch}'.`;
    } catch (error) {
      note = `${note.replace(/\.$/, "")}, but could not delete '${workBranch}' (${(error as Error).message}). `
        + "The branch is left in place.";
    }
  }

  const outcomeKind = (state.mergeStatus as string | undefined) === "merged" ? "merged-cleared" : "reset";
  await saveState({
    status: "idle",
    lastOutcome: { kind: outcomeKind, originalBranch, workBranch, at: new Date().toISOString() },
  }, stateFile);
  return { ok: true, message: note };
}

export interface MergeAppResult {
  ok: boolean;
  message: string;
}

export async function mergeApp(
  { stateFile = STATE_FILE }: { stateFile?: string } = {},
): Promise<MergeAppResult> {
  const state = (await readState(stateFile)) ?? {};
  const projectPath = state.projectPath as string | undefined;
  const originalBranch = state.originalBranch as string | undefined;
  const workBranch = state.workBranch as string | undefined;
  const status = state.status as string | undefined;
  const mergeStatus = state.mergeStatus as string | undefined;

  if (!projectPath || !originalBranch || !workBranch) {
    return {
      ok: false,
      message: "Cannot merge: the run did not record a project path, original branch and work branch.",
    };
  }

  if (status !== "completed") {
    return { ok: false, message: "Cannot merge: the run is not completed yet." };
  }

  if (mergeStatus === "merged") {
    return { ok: false, message: `Already merged '${workBranch}' into '${originalBranch}'.` };
  }

  const phases = Array.isArray(state.phases) ? state.phases as Record<string, unknown>[] : [];
  const anyFailed = phases.some(
    p => p.status === "failed" || p.gateStatus === "failed",
  );
  if (anyFailed) {
    return { ok: false, message: "Cannot merge: one or more verification gates failed. Review the failures first." };
  }

  const git = (args: string[]) => execFileAsync("git", args, { cwd: projectPath, timeout: 10000 });

  let current: string;
  try {
    current = (await git(["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim();
  } catch (error) {
    return { ok: false, message: `Cannot merge: not a git repository or git failed (${(error as Error).message}).` };
  }

  if (current !== workBranch) {
    return {
      ok: false,
      message: `Cannot merge: the repository is on '${current}', not the modernization branch '${workBranch}'.`,
    };
  }

  const findingsFixed = typeof state.findingsFixed === "number" ? state.findingsFixed as number : 0;
  const phaseCount = phases.filter(p => p.status === "completed").length;
  const commitMessage = `chore: modernize UI5 app — ${findingsFixed} findings fixed across ${phaseCount} phases`;

  const worktreeRoot = await getWorktreeRoot(projectPath);

  if (worktreeRoot) {
    // The root checkout is already on originalBranch (that is why the worktree had to
    // hold the work branch), so merge directly there without any checkout dance.
    const rootGit = (args: string[]) => execFileAsync("git", ["-C", worktreeRoot, ...args], { timeout: 10000 });
    try {
      await rootGit(["merge", "--no-ff", workBranch, "-m", commitMessage]);
    } catch (error) {
      await rootGit(["merge", "--abort"]).catch(() => {});
      return { ok: false, message: `Merge failed (${(error as Error).message}). The merge was aborted; '${originalBranch}' is unchanged.` };
    }
    // The branch is now merged into the root; drop the worktree that held it.
    await execFileAsync("git", ["-C", worktreeRoot, "worktree", "remove", projectPath], { timeout: 10000 }).catch(() => {});
  } else {
    try {
      await git(["checkout", originalBranch]);
      await git(["merge", "--no-ff", workBranch, "-m", commitMessage]);
    } catch (error) {
      await git(["checkout", workBranch]).catch(() => {});
      return { ok: false, message: `Merge failed (${(error as Error).message}). Repository is back on '${workBranch}'.` };
    }
  }

  const existing = (await readState(stateFile)) ?? {};
  await saveState({ ...existing, mergeStatus: "merged", mergedAt: new Date().toISOString() }, stateFile);

  return { ok: true, message: `Merged '${workBranch}' into '${originalBranch}'. ${commitMessage}` };
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
      structuredContent: { ...(state ?? { status: "idle" }), serverBuild: SERVER_BUILD },
    };
  };

  // Only this explicit tool opens a widget. Data tools must not carry a UI resource.
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
    statusResult,
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

  // Tool: reset-app — undo the whole run by switching back to the original branch
  server.registerTool(
    "reset-app",
    {
      title: "Reset Modernized App",
      description:
        "Undo the entire modernization and return the app to its original state by switching the repository back "
        + "to the branch the user started on. The modernization work stays on its own branch as a backup unless "
        + "removeWorkBranch is set. Only acts when the repo is still on the recorded modernization branch.",
      inputSchema: z.object({ removeWorkBranch: z.boolean().optional() }),
      outputSchema: stateSchema,
    },
    async (args: { removeWorkBranch?: boolean }): Promise<CallToolResult> => {
      const result = await resetApp({ removeWorkBranch: args.removeWorkBranch, stateFile });
      return {
        content: [{ type: "text", text: result.message }],
        structuredContent: { status: "idle" },
        isError: result.ok ? undefined : true,
      };
    },
  );

  // Tool: merge-app — merge the modernization branch into the original branch
  server.registerTool(
    "merge-app",
    {
      title: "Merge Modernized App",
      description:
        "Merge the modernization work branch into the user's original branch using git merge --no-ff. "
        + "Only available when the run is completed and all verification gates passed. "
        + "The merge commit summarizes the run (findings fixed, phases completed). "
        + "After merging, the dashboard stays on the completed screen with mergeStatus:'merged'.",
      inputSchema: z.object({}),
      outputSchema: stateSchema,
    },
    async (): Promise<CallToolResult> => {
      const result = await mergeApp({ stateFile });
      const state = await readState(stateFile);
      return {
        content: [{ type: "text", text: result.message }],
        structuredContent: state ?? { status: "idle" },
        isError: result.ok ? undefined : true,
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

  // Tool: stop-status — mark the run as stopped early while preserving progress
  server.registerTool(
    "stop-status",
    {
      title: "Stop Modernization",
      description:
        "Mark the modernization as stopped by the user before it completed. " +
        "Call this (instead of pushing status:\"completed\") when the user asks to stop/abort the run. " +
        "The existing state is preserved — remaining findings, phases and deferred issues stay visible on the end screen. " +
        "Pass an optional free-text reason shown on the dashboard.",
      inputSchema: z.object({
        reason: z.string().optional(),
        note: z.string().optional().describe("1–3 sentence description of the state at stop time — which phase was active, whether changes were committed, what remains. Shown below the phase summary in the dashboard. Plain prose, no markdown."),
      }),
      outputSchema: stateSchema,
    },
    async (args: { reason?: string; note?: string }): Promise<CallToolResult> => {
      // Keep stopRequested true for consistency: the agent (or a reloaded UI) should
      // see a single coherent "the user asked to stop" signal alongside the terminal state.
      const merged = await writeState(stateFile, { status: "stopped", stopReason: args.reason ?? null, stopNote: args.note ?? null, stopRequested: true });
      return {
        content: [{ type: "text", text: `Modernization stopped${args.reason ? `: ${args.reason}` : ""}.` }],
        structuredContent: merged,
      };
    },
  );

  // Tool: request-stop — the dashboard Stop button's entry point. Sets only the
  // stopRequested flag and leaves status "running", so the live view keeps showing the
  // run while the agent finishes the current checkpoint. The agent reads the flag back
  // from its next update-status call and then calls stop-status to finalize. Decoupling
  // the button from the terminal state is what makes "stop at the next safe point" honest.
  server.registerTool(
    "request-stop",
    {
      title: "Request Stop",
      description:
        "Request that the modernization stop at the next safe checkpoint. " +
        "Called by the dashboard Stop button. Sets stopRequested:true WITHOUT changing status — " +
        "the run stays \"running\" until the agent acknowledges the flag and calls stop-status itself. " +
        "Idempotent: calling it again while a stop is already requested is harmless.",
      inputSchema: z.object({}),
      outputSchema: stateSchema,
    },
    async (): Promise<CallToolResult> => {
      const merged = await writeState(stateFile, { stopRequested: true });
      return {
        content: [{ type: "text", text: "Stop requested — the agent will stop at the next checkpoint." }],
        structuredContent: merged,
      };
    },
  );

  // Tool: pause-status — the agent calls this once it has actually paused at a safe
  // checkpoint. Flips status to "paused" (resumable) and clears pauseRequested since
  // the pause is now in effect. Progress is preserved so a later resume can continue.
  server.registerTool(
    "pause-status",
    {
      title: "Pause Modernization",
      description:
        "Mark the modernization as paused at a safe checkpoint. The agent calls this after it has "
        + "stopped its current work in response to a pause request. Sets status:\"paused\" and clears "
        + "pauseRequested. All progress (phases, findings, branch) is preserved so the run can be resumed.",
      inputSchema: z.object({}),
      outputSchema: stateSchema,
    },
    async (): Promise<CallToolResult> => {
      const merged = await writeState(stateFile, { status: "paused", pauseRequested: null });
      return {
        content: [{ type: "text", text: "Modernization paused — resume or stop from the dashboard." }],
        structuredContent: merged,
      };
    },
  );

  // Tool: request-pause — the dashboard Pause button's entry point. Sets only the
  // pauseRequested flag and leaves status "running". The agent reads the flag back from
  // its next update-status call, pauses at the next checkpoint, and calls pause-status.
  // Same two-stage decoupling as request-stop → stop-status.
  server.registerTool(
    "request-pause",
    {
      title: "Request Pause",
      description:
        "Request that the modernization pause at the next safe checkpoint. "
        + "Called by the dashboard Pause button. Sets pauseRequested:true WITHOUT changing status — "
        + "the run stays \"running\" until the agent acknowledges the flag and calls pause-status itself. "
        + "Idempotent: calling it again while a pause is already requested is harmless.",
      inputSchema: z.object({}),
      outputSchema: stateSchema,
    },
    async (): Promise<CallToolResult> => {
      const merged = await writeState(stateFile, { pauseRequested: true });
      return {
        content: [{ type: "text", text: "Pause requested — the agent will pause at the next checkpoint." }],
        structuredContent: merged,
      };
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
