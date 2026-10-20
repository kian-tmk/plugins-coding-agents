import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import { marked } from "marked";
import "./mcp-app.css";

// ── Types ────────────────────────────────────────────────────────────────────

type PhaseStatus = "pending" | "running" | "testing" | "completed" | "failed";
type GateStatus = "idle" | "running" | "passed" | "failed";

interface PhaseState {
  id: number;
  name: string;
  description: string;
  status: PhaseStatus;
  gateStatus: GateStatus;
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

interface GitCommit {
  hash: string;
  message: string;
  ts: string;
}

interface GitActivity {
  commits: GitCommit[];
  modifiedFiles: string[];
  lastPolledAt: string;
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
  gitActivity: GitActivity | null;
  lastGitActivityAt: string | null;
}

// ── DOM refs ─────────────────────────────────────────────────────────────────

const screenIdle = document.getElementById("screen-idle")!;
const screenDashboard = document.getElementById("screen-dashboard")!;
const screenCompleted = document.getElementById("screen-completed")!;
const btnFullscreen = document.getElementById("btn-fullscreen") as HTMLButtonElement | null;
const btnFullscreenCompleted = document.getElementById("btn-fullscreen-completed") as HTMLButtonElement | null;
const stepperEl = document.getElementById("stepper")!;
const mdOverlay = document.getElementById("md-overlay")!;
const mdTitle = document.getElementById("md-title")!;
const mdBody = document.getElementById("md-body")!;
const mdClose = document.getElementById("md-close")!;

mdClose.addEventListener("click", () => mdOverlay.classList.add("hidden"));
mdOverlay.addEventListener("click", (e) => { if (e.target === mdOverlay) mdOverlay.classList.add("hidden"); });

// Preferred inline width for the dashboard. Reported to the host on connect so
// the panel renders a bit wider than the default.
const PREFERRED_WIDTH = 720;

// ── MCP App ──────────────────────────────────────────────────────────────────

const app = new App({ name: "UI5 Modernization", version: "1.0.0" });

function handleHostContext(ctx: McpUiHostContext) {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
  if (ctx.displayMode) syncDisplayModeButton(ctx.displayMode);
}

// Ask the host for a wider inline frame. Height is left to the host / content.
function requestPreferredWidth() {
  app.sendSizeChanged({ width: PREFERRED_WIDTH }).catch(() => {});
}

// ── Fullscreen toggle ──────────────────────────────────────────────────────────

let currentDisplayMode: "inline" | "fullscreen" | "pip" = "inline";

function syncDisplayModeButton(mode: "inline" | "fullscreen" | "pip") {
  currentDisplayMode = mode;
  const label = mode === "fullscreen" ? "⤢ Inline" : "⤢ Fullscreen";
  if (btnFullscreen) btnFullscreen.textContent = label;
  if (btnFullscreenCompleted) btnFullscreenCompleted.textContent = label;
  document.body.classList.toggle("fullscreen", mode === "fullscreen");
}

async function toggleFullscreen() {
  const next = currentDisplayMode === "fullscreen" ? "inline" : "fullscreen";
  try {
    const result = await app.requestDisplayMode({ mode: next });
    syncDisplayModeButton(result.mode);
  } catch (err) {
    console.error("display mode change failed:", err);
  }
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
    const ratio = (d - minDur) / range;
    if (ratio < 0.33) return "var(--green)";
    if (ratio < 0.67) return "var(--amber)";
    return "#e07b54";
  }

  phases.forEach((phase, i) => {
    const step = document.createElement("div");
    step.className = `step ${phase.status}`;

    const circle = document.createElement("div");
    circle.className = "step-circle";
    if (phase.status === "completed") circle.textContent = "✓";
    else if (phase.status === "failed") circle.textContent = "✗";
    else circle.textContent = String(phase.id);

    const label = document.createElement("div");
    label.className = "step-label";
    label.textContent = phase.name;

    step.appendChild(circle);
    step.appendChild(label);

    if ((phase.status === "completed" || phase.status === "failed") && phase.durationSeconds != null) {
      const dur = document.createElement("div");
      dur.className = "step-duration";
      dur.textContent = formatElapsed(phase.durationSeconds);
      dur.style.color = phase.status === "failed" ? "var(--red)" : durationColor(phase.durationSeconds);
      step.appendChild(dur);
    }

    stepperEl.appendChild(step);

    if (i < phases.length - 1) {
      // Gate circle: show after a phase if it has a non-idle gate
      const gate = phase.gateStatus;
      if (gate !== "idle") {
        // Short connector before gate
        const connBefore = document.createElement("div");
        const phaseDone = phase.status === "completed";
        const phaseFailed = phase.status === "failed";
        connBefore.className = `step-connector step-connector-short${phaseDone ? " completed" : ""}${phaseFailed ? " failed" : ""}`;
        stepperEl.appendChild(connBefore);

        // Gate node
        const gateStep = document.createElement("div");
        gateStep.className = `step step-gate gate-${gate}`;
        const gateCircle = document.createElement("div");
        gateCircle.className = "step-circle step-gate-circle";
        gateCircle.textContent = gate === "passed" ? "✓" : gate === "failed" ? "✗" : "⚙";
        const gateLabel = document.createElement("div");
        gateLabel.className = "step-label";
        gateLabel.textContent = "Gate";
        gateStep.appendChild(gateCircle);
        gateStep.appendChild(gateLabel);
        stepperEl.appendChild(gateStep);

        // Short connector after gate
        const connAfter = document.createElement("div");
        const gatePassed = gate === "passed";
        const gateFailed = gate === "failed";
        const nextActive = phases[i + 1]?.status === "running";
        connAfter.className = `step-connector step-connector-short${gatePassed ? " completed" : ""}${gateFailed ? " failed" : ""}${nextActive ? " active" : ""}`;
        stepperEl.appendChild(connAfter);
      } else {
        // Normal connector (no gate shown yet)
        const conn = document.createElement("div");
        const prevDone = phase.status === "completed";
        const prevFailed = phase.status === "failed";
        const nextActive = phases[i + 1]?.status === "running";
        conn.className = `step-connector${prevDone ? " completed" : ""}${prevFailed ? " failed" : ""}${nextActive ? " active" : ""}`;
        stepperEl.appendChild(conn);
      }
    }
  });
}

function buildPhaseCommits(phases: PhaseState[], gitActivity: GitActivity | null) {
  const container = document.getElementById("phase-commits")!;
  const completed = phases.filter((p) => (p.status === "completed" || p.status === "testing" || p.status === "failed") && p.commit);

  // Git-activity commits not yet in phases (in-progress work)
  const knownHashes = new Set(phases.map(p => p.commit).filter(Boolean));
  const liveCommits = (gitActivity?.commits ?? []).filter(c => !knownHashes.has(c.hash));

  if (completed.length === 0 && liveCommits.length === 0) {
    container.innerHTML = "";
    return;
  }

  const phaseRows = completed.map((p) => {
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
  });

  const liveRows = liveCommits.map((c) => `<div class="commit-row commit-row-live">
      <span class="commit-phase" style="color:var(--blue-light)">live</span>
      <span class="commit-hash">${escapeHtml(c.hash)}</span>
      <span class="commit-msg">${escapeHtml(c.message)}</span>
      <span class="commit-fixed"></span>
      <span class="commit-dur"></span>
    </div>`);

  container.innerHTML = [...phaseRows, ...liveRows].join("");
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function renderGitActivity(gitActivity: GitActivity | null, phases: PhaseState[]) {
  const container = document.getElementById("git-activity")!;
  if (!container) return;

  const modFiles = gitActivity?.modifiedFiles ?? [];
  // Filter out files that are already part of committed phases
  const committedPhases = phases.filter(p => p.status === "completed" || p.status === "failed");

  if (modFiles.length === 0) {
    container.innerHTML = "";
    container.style.display = "none";
    return;
  }

  container.style.display = "";
  const MAX_FILES = 5;
  const shown = modFiles.slice(0, MAX_FILES);
  const extra = modFiles.length - MAX_FILES;
  const fileList = shown.map(f => {
    const short = f.split("/").slice(-2).join("/");
    return `<span class="git-file">${escapeHtml(short)}</span>`;
  }).join(" ");
  const moreText = extra > 0 ? ` <span class="git-file-more">+${extra} more</span>` : "";
  container.innerHTML = `<span class="git-activity-icon">✏</span> ${fileList}${moreText}`;
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

  const isRunning = state.status === "running";
  const dot = document.getElementById("status-dot") as HTMLElement;
  const isGateRunning = state.phases?.some(p => p.gateStatus === "running");
  const isFailed = state.phases?.some(p => p.status === "failed" || p.gateStatus === "failed");
  const lastActive = state.lastGitActivityAt ? new Date(state.lastGitActivityAt).getTime() : null;
  const silentMs = lastActive !== null ? Date.now() - lastActive : null;
  const isWaiting = isRunning && silentMs !== null && silentMs > 90_000;
  const silentMin = silentMs !== null ? Math.round(silentMs / 60_000) : 0;
  const waitingText = silentMin >= 2 ? `Waiting... · vor ${silentMin}m` : "Waiting...";
  const dotState = isFailed ? "failed" : isWaiting ? "pending" : isRunning ? (isGateRunning ? "testing" : "running") : (activePhase?.status ?? "pending");
  dot.className = `status-dot ${dotState}`;
  setText("status-text", isFailed ? "Failed" : isWaiting ? waitingText : isGateRunning ? "Gate running" : isRunning ? "Running" : activePhase?.status ?? "—");

  syncLiveTimer(0, state.phaseStartedAt ?? null);
  setText("stat-fixed", String(state.findingsFixed ?? 0));
  setText("stat-total", String(state.totalFindings ?? state.linterBaseline ?? 0));
  setText("stat-progress", `${pct}%`);
  const commits = state.phases.filter((p) => p.commit).length;
  setText("stat-commits", String(commits));

  // Activity + live git file changes
  setText("activity-text", state.currentActivity || "—");
  renderGitActivity(state.gitActivity ?? null, state.phases);

  // Phase commit list
  buildPhaseCommits(state.phases, state.gitActivity ?? null);
}

function renderCompleted(state: ModernizationState) {
  const elapsedSec = (state.elapsedSeconds && state.elapsedSeconds > 0)
    ? state.elapsedSeconds
    : (state.startedAt && state.completedAt)
      ? Math.round((new Date(state.completedAt).getTime() - new Date(state.startedAt).getTime()) / 1000)
      : (state.startedAt ? Math.round((Date.now() - new Date(state.startedAt).getTime()) / 1000) : 0);
  const elapsed = formatElapsed(elapsedSec);
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

  function linkCard(filePath: string, title: string, icon: string, sub: string) {
    const reportFile = filePath.split("/").pop() ?? "";
    const downloadAttr = standaloneMode
      ? `<a class="completed-link-download" href="http://localhost:3001/files/${encodeURIComponent(reportFile)}" download="${escapeHtml(reportFile)}" title="Download">⬇</a>`
      : "";
    return `
    <div class="completed-link-wrap">
      <button class="completed-link" data-path="${escapeHtml(filePath)}" data-title="${escapeHtml(title)}">
        <span class="completed-link-icon">${icon}</span>
        <div>
          <div class="completed-link-label">${escapeHtml(title)}</div>
          <div class="completed-link-sub">${sub}</div>
        </div>
      </button>${downloadAttr}
    </div>`;
  }

  linksEl.innerHTML =
    linkCard(state.reportPath, "MODERNIZATION-REPORT.md", "📄", "Full phase breakdown &amp; statistics") +
    linkCard(state.issuesPath, "MODERNIZATION-ISSUES.md", "⚠", `${issues.length} deferred finding${issues.length !== 1 ? "s" : ""} for manual review`);

  linksEl.querySelectorAll<HTMLButtonElement>(".completed-link[data-path]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = btn.dataset.path ?? "";
      const t = btn.dataset.title ?? "File";
      openMarkdown(p, t);
    });
  });
}

// ── State handling ────────────────────────────────────────────────────────────

function normalizePhase(p: Record<string, unknown>, index: number): PhaseState {
  // Back-compat: if old skill set status="testing", treat it as gateStatus="running"
  const rawStatus = (p.status ?? "pending") as PhaseStatus;
  const effectiveStatus: PhaseStatus = rawStatus === "testing" ? "completed" : rawStatus;
  const defaultGate: GateStatus = rawStatus === "testing" ? "running" : "idle";
  return {
    id: (p.id ?? p.phase ?? index + 1) as number,
    name: (p.name ?? p.title ?? `Phase ${index + 1}`) as string,
    description: (p.description ?? "") as string,
    status: effectiveStatus,
    gateStatus: (p.gateStatus ?? defaultGate) as GateStatus,
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

  // Treat stale "running" state (startedAt > 24h ago) as idle to avoid phantom timers
  const isStale = state.status === "running" && state.startedAt
    && (Date.now() - new Date(state.startedAt).getTime()) > 24 * 60 * 60 * 1000;

  if (state.status === "idle" || !state.status || isStale) {
    stopLiveTimer();
    showScreen("idle");
  } else if (state.status === "running") {
    showScreen("dashboard");
    renderDashboard(state);
    const lastActive = state.lastGitActivityAt ? new Date(state.lastGitActivityAt).getTime() : null;
    const isInactive = lastActive !== null && (Date.now() - lastActive) > 90_000;
    if (isInactive) {
      pauseLiveTimer();
    } else if (state.startedAt) {
      startLiveTimer(state.startedAt, state.phaseStartedAt ?? null);
    }
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
// Elapsed counts up from startedAt, pauses on inactivity, never goes back.
// The server value (elapsedSeconds) is ignored once the timer is running —
// startedAt is the single source of truth.

let timerInterval: ReturnType<typeof setInterval> | null = null;
let timerStartedAt = 0;       // absolute ms timestamp when run began
let timerPausedAt: number | null = null;  // elapsed ms at pause point
let phaseTimerBase = 0;

function tickTimer() {
  const elapsed = timerPausedAt !== null
    ? timerPausedAt
    : Date.now() - timerStartedAt;
  setText("stat-elapsed", formatElapsed(Math.round(elapsed / 1000)));
  if (phaseTimerBase) {
    setText("phase-elapsed", formatElapsed(Math.round((Date.now() - phaseTimerBase) / 1000)));
  }
}

function startLiveTimer(startedAt: string, phaseStartedAt: string | null) {
  if (phaseStartedAt) phaseTimerBase = new Date(phaseStartedAt).getTime();
  // Only anchor startedAt on first start — never overwrite once running
  if (!timerStartedAt) timerStartedAt = new Date(startedAt).getTime();
  timerPausedAt = null;
  if (timerInterval) return;
  tickTimer();
  timerInterval = setInterval(tickTimer, 1000);
}

function pauseLiveTimer() {
  if (timerPausedAt !== null) return; // already paused
  timerPausedAt = timerStartedAt ? Date.now() - timerStartedAt : 0;
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  tickTimer(); // update display once at pause value
}

function stopLiveTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  timerStartedAt = 0;
  timerPausedAt = null;
  phaseTimerBase = 0;
  setText("phase-elapsed", "");
}

function syncLiveTimer(_serverElapsed: number, phaseStartedAt: string | null) {
  if (phaseStartedAt) phaseTimerBase = new Date(phaseStartedAt).getTime();
}

// ── Standalone mode detection ────────────────────────────────────────────────
// When opened directly in a browser (not inside Claude Desktop's MCP app
// iframe), app.connect() will fail. In that case, fall back to polling the
// REST API at /api/status instead of using the MCP tool calls.

let standaloneMode = false;

// ── Markdown viewer ───────────────────────────────────────────────────────────

async function openMarkdown(filePath: string, title: string) {
  mdTitle.textContent = title;
  mdBody.innerHTML = `<div class="md-loading">Loading…</div>`;
  mdOverlay.classList.remove("hidden");

  try {
    if (standaloneMode) {
      const filename = filePath.split("/").pop() ?? "";
      const res = await fetch(`http://localhost:3001/files/${encodeURIComponent(filename)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      mdBody.innerHTML = await marked.parse(text) as string;
      return;
    }
    // Claude Desktop: call get-file tool via MCP
    const result = await app.callServerTool({ name: "get-file", arguments: { path: filePath } }) as any;
    const content: string = result?.structuredContent?.content ?? "";
    if (!content) throw new Error("Empty response");
    mdBody.innerHTML = await marked.parse(content) as string;
  } catch (err) {
    mdBody.innerHTML = `<div class="md-error">Could not load file.<br><small>${String(err)}</small></div>`;
  }
}

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

btnFullscreen?.addEventListener("click", toggleFullscreen);
btnFullscreenCompleted?.addEventListener("click", toggleFullscreen);

// ── Connect ───────────────────────────────────────────────────────────────────

app.onteardown = async () => { polling = false; stopLiveTimer(); return {}; };
app.onerror = console.error;
app.onhostcontextchanged = handleHostContext;

app.ontoolresult = (result) => {
  applyState(result.structuredContent);
};

// ── Eager REST pre-fetch ──────────────────────────────────────────────────────
// Show the correct screen immediately on load without waiting for app.connect()
// to resolve. If the server already has a running/completed state, don't make
// the user stare at idle while the MCP handshake is still in flight.
fetchRestStatus().then((state) => {
  if (document.body.className) return; // connect() already resolved, don't interfere
  if (state?.status === "running") {
    showScreen("dashboard");
    renderDashboard(state);
  } else if (state?.status === "completed") {
    showScreen("completed");
    renderCompleted(state);
  }
});

// Try MCP app connection first; fall back to standalone REST polling
app.connect().then(async () => {
  document.body.classList.add("desktop");
  // Propagate iframe height to html/body so height:100% works in CSS
  document.documentElement.style.height = "100%";
  document.body.style.height = "100%";
  const ctx = app.getHostContext();
  if (ctx) handleHostContext(ctx);
  requestPreferredWidth();

  // Check if a run is already active on load
  let desktopInitDone = false;
  try {
    const result = await app.callServerTool({ name: "get-status", arguments: {} });
    const state = result.structuredContent as ModernizationState | undefined;
    if (state?.status === "running") {
      showScreen("dashboard");
      renderDashboard(state);
      startPolling();
      desktopInitDone = true;
    } else if (state?.status === "completed") {
      showScreen("completed");
      renderCompleted(state);
      desktopInitDone = true;
    }
  } catch {
    // get-status via MCP failed — fall back to REST
  }

  if (!desktopInitDone) {
    // MCP get-status unavailable or returned idle — try REST as fallback
    const restState = await fetchRestStatus();
    if (restState?.status === "running") {
      showScreen("dashboard");
      renderDashboard(restState);
      startPolling();
    } else if (restState?.status === "completed") {
      showScreen("completed");
      renderCompleted(restState);
    } else {
      showScreen("idle");
      startPolling();
    }
  }
}).catch(async () => {
  // MCP app connection failed — running in standalone browser mode
  console.log("MCP app connection unavailable — using standalone REST polling");
  standaloneMode = true;

  // Hide fullscreen buttons — not meaningful in a plain browser tab
  if (btnFullscreen) btnFullscreen.style.display = "none";
  if (btnFullscreenCompleted) btnFullscreenCompleted.style.display = "none";

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
