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
  phaseStartedAt: z.string().nullable().describe("Server-managed phase start time; set currentPhase instead."),
  mergedAt: z.string().nullable().describe("Server-managed merge completion time; omit from updates."),
  mergeStatus: z.enum(["pending", "merged", "skipped"]).nullable(),
  lastGitActivityAt: z.string().nullable(),
  gitActivity: z.object({
    commits: z.array(z.object({ hash: z.string(), message: z.string(), ts: z.string() })),
    modifiedFiles: z.array(z.string()), lastPolledAt: z.string(),
  }).nullable(),
}).partial().passthrough();

export const updateSchema = stateSchema.refine(
  value => Object.keys(value).some(key => key in stateSchema.shape
    && !["startedAt", "phaseStartedAt", "completedAt", "stoppedAt", "mergedAt"].includes(key)),
  "Supply at least one writable modernization status field. Empty or clock-only updates are not saved.",
);
