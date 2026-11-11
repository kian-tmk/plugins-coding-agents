import { z } from "zod";

// Claude's tool bridge retains declared properties. Passthrough alone is not enough.
const phaseSchema = z.object({
  id: z.number(), name: z.string(), description: z.string(),
  status: z.enum(["pending", "running", "testing", "completed", "failed"]),
  gateStatus: z.enum(["idle", "running", "passed", "failed"]),
  gateDurationSeconds: z.number().nullable(), gateTestsPassed: z.number().nullable(),
  gateTestsTotal: z.number().nullable(), gateNote: z.string().nullable(),
  findingsBefore: z.number().nullable(), findingsAfter: z.number().nullable(),
  filesChanged: z.number().nullable(), commit: z.string().nullable(),
  commitMessage: z.string().nullable(), skills: z.array(z.string()),
  durationSeconds: z.number().nullable(),
}).partial().passthrough();

export const stateSchema = z.object({
  runId: z.string(), status: z.enum(["idle", "running", "completed", "stopped"]),
  project: z.string(), projectPath: z.string(), ui5Version: z.string(), model: z.string(),
  verificationMode: z.string(), buildCommand: z.string(), testCommand: z.string(),
  workingTreeStatus: z.string(), linterBaseline: z.number(), totalFindings: z.number(),
  originalBranch: z.string().nullable().describe("Branch the user was on at start; the reset target."),
  workBranch: z.string().nullable().describe("Dedicated modernization branch the run commits to."),
  findingsFixed: z.number(), findingsRemaining: z.number(), currentPhase: z.number(),
  currentActivity: z.string(), elapsedSeconds: z.number(), overallProgress: z.number(),
  phases: z.array(phaseSchema),
  deferredIssues: z.array(z.object({
    file: z.string(), rule: z.string(), message: z.string(), reason: z.string(),
  })),
  reportPath: z.string(), issuesPath: z.string(),
  serverBuild: z.string().describe("Server build identity; read-only, for stale-runtime detection."),
  startedAt: z.string().nullable().describe("Server-managed run start time; omit from updates."),
  completedAt: z.string().nullable().describe("Server-managed completion time; omit from updates."),
  stoppedAt: z.string().nullable().describe("Server-managed stop time; omit from updates."),
  stopReason: z.string().nullable().describe("Free-text reason why the run was stopped early."),
  stopRequested: z.boolean().nullable().describe(
    "Set true by the dashboard Stop button (request-stop) while the run is still running. "
    + "The agent reads it back from update-status and stops at the next checkpoint, then calls "
    + "stop-status. A pure signal — it does not change `status` on its own.",
  ),
  phaseStartedAt: z.string().nullable().describe("Server-managed phase start time; set currentPhase instead."),
  mergedAt: z.string().nullable().describe("Server-managed merge completion time; omit from updates."),
  mergeStatus: z.enum(["pending", "merged", "skipped"]).nullable(),
  // Early-run sub-state before the phase view exists. Set by the skill: "started"
  // (dashboard just opened, nothing analyzed) → "linting" (baseline linter running)
  // → "analyzed" (linter done, phases about to arrive — bridges the gap so the screen
  // isn't blank while the first phases push is prepared).
  // Cleared once the first phases array arrives. Drives the idle screen's state 1/2/2b.
  stage: z.enum(["started", "linting", "analyzed"]).nullable(),
  // Server-written, persistent confirmation of the last reset/clear action. Read by
  // the idle screen so the "it worked" message survives a reload or a second tab
  // (unlike the client-only transient outcome). Cleared when a new run starts.
  lastOutcome: z.object({
    kind: z.enum(["reset", "merged-cleared"]),
    originalBranch: z.string().nullable(),
    workBranch: z.string().nullable(),
    at: z.string(),
  }).nullable(),
  lastGitActivityAt: z.string().nullable(),
  gitActivity: z.object({
    commits: z.array(z.object({ hash: z.string(), message: z.string(), ts: z.string() })),
    modifiedFiles: z.array(z.string()), lastPolledAt: z.string(),
  }).nullable(),
}).partial().passthrough();

// Clock/meta fields the server manages itself — present in the schema so they parse,
// but they do not count as a meaningful update on their own.
const CLOCK_ONLY_FIELDS = ["startedAt", "phaseStartedAt", "completedAt", "stoppedAt", "mergedAt"];

// Every field a caller may actually write (the schema minus the server-managed clocks).
const WRITABLE_FIELDS = Object.keys(stateSchema.shape).filter(k => !CLOCK_ONLY_FIELDS.includes(k));

// Suggest the closest writable field name for a key the caller got slightly wrong
// (case, singular/plural, a stray prefix). Pure string overlap — no dependency.
function suggestField(key: string): string | undefined {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = norm(key);
  if (!target) return undefined;
  let best: string | undefined;
  let bestScore = 0;
  for (const field of WRITABLE_FIELDS) {
    const candidate = norm(field);
    if (candidate === target) return field;
    // Longest shared prefix + containment as a cheap similarity score.
    let prefix = 0;
    while (prefix < candidate.length && prefix < target.length && candidate[prefix] === target[prefix]) prefix++;
    const contains = candidate.includes(target) || target.includes(candidate) ? 2 : 0;
    const score = prefix + contains;
    if (score > bestScore) { bestScore = score; best = field; }
  }
  return bestScore >= 3 ? best : undefined;
}

export const updateSchema = stateSchema.superRefine((value, ctx) => {
  const keys = Object.keys(value);
  const hasWritable = keys.some(key => key in stateSchema.shape && !CLOCK_ONLY_FIELDS.includes(key));
  if (hasWritable) return;

  // Nothing writable arrived. Build a diagnostic message so a caller that used the
  // wrong field names (or wrapped the payload) can correct itself instead of guessing.
  const unknown = keys.filter(key => !(key in stateSchema.shape));
  const clockOnly = keys.filter(key => CLOCK_ONLY_FIELDS.includes(key));

  let message = "Supply at least one writable modernization status field. Empty or clock-only updates are not saved.";
  if (keys.length === 0) {
    message += " You sent an empty object — send the status fields directly as top-level keys (e.g. status, currentPhase, phases, currentActivity).";
  } else {
    message += ` Received keys: [${keys.join(", ")}].`;
    if (unknown.length) {
      const hints = unknown
        .map(key => { const s = suggestField(key); return s ? `${key} → ${s}` : null; })
        .filter(Boolean);
      message += ` Unrecognized: [${unknown.join(", ")}] (not merged).`;
      if (hints.length) message += ` Did you mean: ${hints.join(", ")}?`;
      // A single unknown key often means the payload was wrapped in an envelope.
      if (keys.length === 1 && value[keys[0]] !== null && typeof value[keys[0]] === "object")
        message += ` If '${keys[0]}' wraps the real fields, send those fields at the top level, not nested.`;
    }
    if (clockOnly.length && !unknown.length) {
      message += ` Only server-managed clock fields were sent ([${clockOnly.join(", ")}]); set currentPhase for phase timing instead of these.`;
    }
  }
  ctx.addIssue({ code: z.ZodIssueCode.custom, message });
});

