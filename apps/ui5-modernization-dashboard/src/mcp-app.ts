import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import "./mcp-app.css";

// ── Types ────────────────────────────────────────────────────────────────────

type PhaseStatus = "pending" | "running" | "completed" | "failed";

interface PhaseState {
  id: number;
  name: string;
  description: string;
  status: PhaseStatus;
  findingsBefore: number | null;
  findingsAfter: number | null;
  filesChanged: number | null;
  commit: string | null;
  commitMessage: string | null;
  skills: string[];
  durationSeconds: number | null;
}

interface DeferredIssue {
  file: string;
  rule: string;
  message: string;
  reason: string;
}

interface ModernizationState {
  runId: string;
  status: "idle" | "running" | "completed";
  project: string;
  projectPath: string;
  ui5Version: string;
  model: string;
  verificationMode: string;
  buildCommand: string;
  testCommand: string;
  workingTreeStatus: string;
  linterBaseline: number;
  totalFindings: number;
  findingsFixed: number;
  findingsRemaining: number;
  currentPhase: number;
  currentActivity: string;
  elapsedSeconds: number;
  overallProgress: number;
  phases: PhaseState[];
  deferredIssues: DeferredIssue[];
  reportPath: string;
  issuesPath: string;
  startedAt: string | null;
  completedAt: string | null;
  phaseStartedAt: string | null;
}

// ── DOM refs ─────────────────────────────────────────────────────────────────

const screenIdle = document.getElementById("screen-idle")!;
const screenDashboard = document.getElementById("screen-dashboard")!;
const screenCompleted = document.getElementById("screen-completed")!;
const btnRestart = document.getElementById("btn-restart")!;
const btnResetHeader = document.getElementById("btn-reset-header")!;
const stepperEl = document.getElementById("stepper")!;

// ── MCP App ──────────────────────────────────────────────────────────────────

const app = new App({ name: "UI5 Modernization", version: "1.0.0" });

function handleHostContext(ctx: McpUiHostContext) {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
}

// ── Render ───────────────────────────────────────────────────────────────────

function showScreen(name: "idle" | "dashboard" | "completed") {
  screenIdle.classList.toggle("hidden", name !== "idle");
  screenDashboard.classList.toggle("hidden", name !== "dashboard");
  screenCompleted.classList.toggle("hidden", name !== "completed");
}

function setText(id: string, value: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function formatElapsed(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return "0s";
  const sec = Math.round(seconds);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function buildStepper(phases: PhaseState[]) {
  stepperEl.innerHTML = "";

  // Compute relative speed color for completed phases
  const durations = phases
    .filter((p) => p.status === "completed" && p.durationSeconds != null)
    .map((p) => p.durationSeconds as number);
  const minDur = durations.length ? Math.min(...durations) : 0;
  const maxDur = durations.length ? Math.max(...durations) : 0;
  const range = maxDur - minDur;

  function durationColor(d: number): string {
    if (range === 0) return "var(--green)";
    const ratio = (d - minDur) / range; // 0 = fastest, 1 = slowest
    if (ratio < 0.33) return "var(--green)";
    if (ratio < 0.67) return "var(--amber)";
    return "#e07b54"; // muted orange-red, not alarm-red
  }

  phases.forEach((phase, i) => {
    const step = document.createElement("div");
    step.className = `step ${phase.status}`;

    const circle = document.createElement("div");
    circle.className = "step-circle";
    circle.textContent = phase.status === "completed" ? "✓" : String(phase.id);

    const label = document.createElement("div");
    label.className = "step-label";
    label.textContent = phase.name;

    step.appendChild(circle);
    step.appendChild(label);

    if (phase.status === "completed" && phase.durationSeconds != null) {
      const dur = document.createElement("div");
      dur.className = "step-duration";
      dur.textContent = formatElapsed(phase.durationSeconds);
      dur.style.color = durationColor(phase.durationSeconds);
      step.appendChild(dur);
    }

    stepperEl.appendChild(step);

    if (i < phases.length - 1) {
      const conn = document.createElement("div");
      const prevDone = phase.status === "completed";
      const nextActive = phases[i + 1]?.status === "running";
      conn.className = `step-connector${prevDone ? " completed" : ""}${nextActive ? " active" : ""}`;
      stepperEl.appendChild(conn);
    }
  });
}

function buildPhaseCommits(phases: PhaseState[]) {
  const container = document.getElementById("phase-commits")!;
  const completed = phases.filter((p) => p.status === "completed" && p.commit);
  if (completed.length === 0) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = completed.map((p) => {
    const fixed = p.findingsBefore != null && p.findingsAfter != null
      ? `${p.findingsBefore - p.findingsAfter} fixed`
      : "";
    const dur = p.durationSeconds != null ? formatElapsed(p.durationSeconds) : "";
    return `<div class="commit-row">
      <span class="commit-phase">Phase ${p.id}</span>
      <span class="commit-hash">${p.commit}</span>
      <span class="commit-msg">${escapeHtml(p.commitMessage ?? "")}</span>
      <span class="commit-fixed">${fixed}</span>
      <span class="commit-dur">${dur}</span>
    </div>`;
  }).join("");
  // Auto-scroll to latest entry
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function renderDashboard(state: ModernizationState) {
  // Preflight
  setText("pf-project", state.project || "—");
  setText("pf-version", state.ui5Version || "—");
  setText("pf-verification", state.verificationMode || "autonomous");
  const worktreeEl = document.getElementById("pf-worktree");
  const worktreeStatus = state.workingTreeStatus || "clean";
  if (worktreeEl) {
    worktreeEl.textContent = worktreeStatus;
    const isClean = /clean/i.test(worktreeStatus);
    const isDirty = /dirty|modified|uncommitted/i.test(worktreeStatus);
    worktreeEl.className = `preflight-value ${isClean ? "preflight-clean" : isDirty ? "preflight-warn" : ""}`;
  }
  setText("pf-baseline", `${state.linterBaseline ?? 0} findings`);

  // Stepper
  buildStepper(state.phases);

  // Current phase info
  const activePhase = state.phases.find((p) => p.status === "running")
    ?? state.phases[state.currentPhase - 1]
    ?? state.phases[0];

  setText("phase-label", `Phase ${activePhase?.id ?? "—"} of ${state.phases.length}`);
  setText("phase-title", activePhase?.name ?? "—");

  const pct = state.overallProgress ?? 0;
  const bar = document.getElementById("progress-bar") as HTMLElement;
  bar.style.width = `${pct}%`;
  setText("progress-pct", `${pct}%`);

  const dot = document.getElementById("status-dot") as HTMLElement;
  const isRunning = state.status === "running";
  dot.className = `status-dot ${isRunning ? "running" : activePhase?.status ?? "pending"}`;
  setText("status-text", isRunning ? "Running" : activePhase?.status ?? "—");

  // Stats — derive elapsedSeconds from startedAt if not present in state
  const elapsed = (state.elapsedSeconds != null && !isNaN(state.elapsedSeconds))
    ? state.elapsedSeconds
    : state.startedAt
      ? Math.round((Date.now() - new Date(state.startedAt).getTime()) / 1000)
      : 0;
  syncLiveTimer(elapsed, state.phaseStartedAt ?? null);
  setText("stat-fixed", String(state.findingsFixed ?? 0));
  setText("stat-total", String(state.totalFindings ?? state.linterBaseline ?? 0));
  setText("stat-elapsed", formatElapsed(elapsed));
  setText("stat-progress", `${pct}%`);
  const commits = state.phases.filter((p) => p.commit).length;
  setText("stat-commits", String(commits));

  // Activity
  setText("activity-text", state.currentActivity || "—");

  // Phase commit list
  buildPhaseCommits(state.phases);
}

function renderCompleted(state: ModernizationState) {
  const elapsed = formatElapsed(state.elapsedSeconds);
  const commits = state.phases.filter((p) => p.commit).length;
  const totalFiles = state.phases.reduce((s, p) => s + (p.filesChanged ?? 0), 0);

  setText("completed-sub", `${state.linterBaseline} findings resolved across ${commits} commits in ${elapsed}`);

  // Stats
  const statsEl = document.getElementById("completed-stats")!;
  statsEl.innerHTML = `
    <div class="completed-stat">
      <div class="completed-stat-value" style="color:var(--green)">${state.linterBaseline}</div>
      <div class="completed-stat-label">findings resolved</div>
    </div>
    <div class="completed-stat">
      <div class="completed-stat-value">${totalFiles}</div>
      <div class="completed-stat-label">files changed</div>
    </div>
    <div class="completed-stat">
      <div class="completed-stat-value">${commits}</div>
      <div class="completed-stat-label">commits</div>
    </div>`;

  // Phase summary
  const phasesEl = document.getElementById("completed-phases")!;
  phasesEl.innerHTML = state.phases.map((p) => {
    const fixed = (p.findingsBefore ?? 0) - (p.findingsAfter ?? 0);
    const dur = p.durationSeconds != null ? formatElapsed(p.durationSeconds) : "—";
    return `<div class="phase-summary-row">
      <span class="ps-num">${p.id}</span>
      <span class="ps-name">${escapeHtml(p.name)}</span>
      <span class="ps-fixed">${fixed > 0 ? `${fixed} fixed` : "—"}</span>
      <span class="ps-files">${p.filesChanged != null ? `${p.filesChanged} files` : "—"}</span>
      <span class="ps-dur">${dur}</span>
      <span class="ps-commit">${p.commit ?? "—"}</span>
    </div>`;
  }).join("");

  // Deferred issues
  const issues = state.deferredIssues ?? [];
  const sectionEl = document.getElementById("section-issues") as HTMLElement;
  if (issues.length > 0) {
    sectionEl.style.display = "";
    setText("issues-count", String(issues.length));
    const issuesEl = document.getElementById("completed-issues")!;
    issuesEl.innerHTML = issues.map((issue) => `
      <div class="issue-row">
        <div class="issue-file">${escapeHtml(issue.file)}</div>
        <span class="issue-rule">${escapeHtml(issue.rule)}</span>
        <div class="issue-msg">${escapeHtml(issue.message)}</div>
        <div class="issue-reason">↳ ${escapeHtml(issue.reason)}</div>
      </div>`).join("");
  } else {
    sectionEl.style.display = "none";
  }

  // Links to report and issues files
  const linksEl = document.getElementById("completed-links")!;
  const reportFile = state.reportPath.split("/").pop();
  const issuesFile = state.issuesPath.split("/").pop();
  linksEl.innerHTML = `
    <a class="completed-link" href="http://localhost:3001/files/${escapeHtml(reportFile ?? "")}" target="_blank" rel="noopener">
      <span class="completed-link-icon">📄</span>
      <div>
        <div class="completed-link-label">MODERNIZATION-REPORT.md</div>
        <div class="completed-link-sub">Full phase breakdown &amp; statistics</div>
      </div>
    </a>
    <a class="completed-link" href="http://localhost:3001/files/${escapeHtml(issuesFile ?? "")}" target="_blank" rel="noopener">
      <span class="completed-link-icon">⚠</span>
      <div>
        <div class="completed-link-label">MODERNIZATION-ISSUES.md</div>
        <div class="completed-link-sub">${issues.length} deferred finding${issues.length !== 1 ? "s" : ""} for manual review</div>
      </div>
    </a>`;
}

// ── State handling ────────────────────────────────────────────────────────────

function normalizePhase(p: Record<string, unknown>, index: number): PhaseState {
  return {
    id: (p.id ?? p.phase ?? index + 1) as number,
    name: (p.name ?? p.title ?? `Phase ${index + 1}`) as string,
    description: (p.description ?? "") as string,
    status: (p.status ?? "pending") as PhaseStatus,
    findingsBefore: (p.findingsBefore ?? null) as number | null,
    findingsAfter: (p.findingsAfter ?? null) as number | null,
    filesChanged: (p.filesChanged ?? null) as number | null,
    commit: (p.commit ?? null) as string | null,
    commitMessage: (p.commitMessage ?? null) as string | null,
    skills: (p.skills ?? []) as string[],
    durationSeconds: (p.durationSeconds ?? null) as number | null,
  };
}

let lastStatus: string | null = null;

function applyState(raw: unknown) {
  if (!raw || typeof raw !== "object") return;
  const state = raw as ModernizationState;

  if (Array.isArray(state.phases)) {
    state.phases = state.phases.map((p, i) =>
      normalizePhase(p as Record<string, unknown>, i)
    );
  }

  if (state.status === "idle" || !state.status) {
    stopLiveTimer();
    showScreen("idle");
  } else if (state.status === "running") {
    showScreen("dashboard");
    renderDashboard(state);
    const derivedElapsed = (state.elapsedSeconds != null && !isNaN(state.elapsedSeconds))
      ? state.elapsedSeconds
      : state.startedAt
        ? Math.round((Date.now() - new Date(state.startedAt).getTime()) / 1000)
        : 0;
    startLiveTimer(derivedElapsed, state.phaseStartedAt ?? null);
  } else if (state.status === "completed") {
    stopLiveTimer();
    // Show dashboard briefly, then switch to completed
    showScreen("dashboard");
    renderDashboard(state);
    if (lastStatus !== "completed") {
      setTimeout(() => {
        showScreen("completed");
        renderCompleted(state);
      }, 1500);
    } else {
      showScreen("completed");
      renderCompleted(state);
    }
  }

  lastStatus = state.status;
}

// ── Live timer ────────────────────────────────────────────────────────────────

let timerInterval: ReturnType<typeof setInterval> | null = null;
let timerBaseSeconds = 0;
let timerBaseTs = 0;
let phaseTimerBase = 0; // ms since epoch when current phase started (0 = unknown)

function startLiveTimer(serverElapsed: number, phaseStartedAt: string | null) {
  timerBaseSeconds = serverElapsed;
  timerBaseTs = Date.now();
  phaseTimerBase = phaseStartedAt ? new Date(phaseStartedAt).getTime() : 0;
  if (timerInterval) return;
  timerInterval = setInterval(() => {
    const elapsed = timerBaseSeconds + Math.round((Date.now() - timerBaseTs) / 1000);
    setText("stat-elapsed", formatElapsed(elapsed));
    if (phaseTimerBase) {
      const phaseSec = Math.round((Date.now() - phaseTimerBase) / 1000);
      setText("phase-elapsed", formatElapsed(phaseSec));
    }
  }, 1000);
}

function stopLiveTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  setText("phase-elapsed", "");
}

function syncLiveTimer(serverElapsed: number, phaseStartedAt: string | null) {
  timerBaseSeconds = serverElapsed;
  timerBaseTs = Date.now();
  if (phaseStartedAt) phaseTimerBase = new Date(phaseStartedAt).getTime();
}

// ── Standalone mode detection ────────────────────────────────────────────────
// When opened directly in a browser (not inside Claude Desktop's MCP app
// iframe), app.connect() will fail. In that case, fall back to polling the
// REST API at /api/status instead of using the MCP tool calls.

let standaloneMode = false;

async function fetchRestStatus(): Promise<ModernizationState | null> {
  try {
    const res = await fetch("/api/status");
    if (!res.ok) return null;
    const data = await res.json();
    return (data && typeof data === "object" && data.status) ? data as ModernizationState : null;
  } catch {
    return null;
  }
}

// ── Polling ───────────────────────────────────────────────────────────────────

let polling = false;

async function poll() {
  if (!polling) return;
  try {
    if (standaloneMode) {
      const state = await fetchRestStatus();
      if (state) applyState(state);
    } else {
      const result = await app.callServerTool({ name: "get-status", arguments: {} });
      applyState(result.structuredContent);
    }
  } catch (err) {
    console.error("poll error:", err);
  }
  if (polling) setTimeout(poll, 1500);
}

function startPolling() {
  polling = true;
  poll();
}

// ── Button handlers ───────────────────────────────────────────────────────────

async function resetDashboard() {
  polling = false;
  stopLiveTimer();
  lastStatus = null;
  try {
    if (standaloneMode) {
      await fetch("/api/reset", { method: "POST" });
    } else {
      await app.callServerTool({ name: "reset-status", arguments: {} });
    }
  } catch (err) {
    console.error("reset failed:", err);
  }
  showScreen("idle");
}

btnRestart.addEventListener("click", resetDashboard);
btnResetHeader.addEventListener("click", resetDashboard);

// ── Connect ───────────────────────────────────────────────────────────────────

app.onteardown = async () => { polling = false; stopLiveTimer(); return {}; };
app.onerror = console.error;
app.onhostcontextchanged = handleHostContext;

app.ontoolresult = (result) => {
  applyState(result.structuredContent);
};

// Try MCP app connection first; fall back to standalone REST polling
app.connect().then(async () => {
  const ctx = app.getHostContext();
  if (ctx) handleHostContext(ctx);

  // Check if a run is already active on load
  try {
    const result = await app.callServerTool({ name: "get-status", arguments: {} });
    const state = result.structuredContent as ModernizationState | undefined;
    if (state?.status === "running") {
      showScreen("dashboard");
      renderDashboard(state);
      startPolling();
    } else if (state?.status === "completed") {
      showScreen("completed");
      renderCompleted(state);
    } else {
      showScreen("idle");
    }
  } catch {
    showScreen("idle");
  }
}).catch(async () => {
  // MCP app connection failed — running in standalone browser mode
  console.log("MCP app connection unavailable — using standalone REST polling");
  standaloneMode = true;

  const state = await fetchRestStatus();
  if (state?.status === "running") {
    showScreen("dashboard");
    renderDashboard(state);
    startPolling();
  } else if (state?.status === "completed") {
    showScreen("completed");
    renderCompleted(state);
  } else {
    showScreen("idle");
    // Start polling even on idle — the agent may push "running" state via curl
    startPolling();
  }
});
