import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import { marked } from "marked";
import "./mcp-app.css";

// ── UI5 Web Components ─────────────────────────────────────────────────────────
// 🔴 CRITICAL: never import "@ui5/webcomponents*/dist/Assets.js" — it registers ALL
// themes + ALL i18n/CLDR and the single-file build then inlines the lot (~14 MB).
// Instead register ONLY the two needed themes (sap_horizon_dark + sap_horizon), for
// each of the three packages that ship theme parameters, using the raw CSS bundles we
// import directly. This is the minimal registration — two themes, no i18n/CLDR.
// See MIGRATION-UI5-WEBCOMPONENTS.md.
import { registerThemePropertiesLoader } from "@ui5/webcomponents-base/dist/asset-registries/Themes.js";
import { setTheme } from "@ui5/webcomponents-base/dist/config/Theme.js";
import darkThemingParams from "@ui5/webcomponents-theming/dist/generated/themes/sap_horizon_dark/parameters-bundle.css.js";
import darkBaseParams from "@ui5/webcomponents/dist/generated/themes/sap_horizon_dark/parameters-bundle.css.js";
import darkFioriParams from "@ui5/webcomponents-fiori/dist/generated/themes/sap_horizon_dark/parameters-bundle.css.js";
import lightThemingParams from "@ui5/webcomponents-theming/dist/generated/themes/sap_horizon/parameters-bundle.css.js";
import lightBaseParams from "@ui5/webcomponents/dist/generated/themes/sap_horizon/parameters-bundle.css.js";
import lightFioriParams from "@ui5/webcomponents-fiori/dist/generated/themes/sap_horizon/parameters-bundle.css.js";

// The theming package carries the base sap* design tokens on :root; the component
// packages author their tokens (incl. density params like row/list-item height)
// under :host, so they MUST be registered with cssVariablesTarget "host" — otherwise
// those :host vars never resolve and controls collapse (e.g. table rows lose height).
registerThemePropertiesLoader("@ui5/webcomponents-theming", "sap_horizon_dark", async () => darkThemingParams);
registerThemePropertiesLoader("@ui5/webcomponents",         "sap_horizon_dark", async () => darkBaseParams, "host");
registerThemePropertiesLoader("@ui5/webcomponents-fiori",   "sap_horizon_dark", async () => darkFioriParams, "host");
registerThemePropertiesLoader("@ui5/webcomponents-theming", "sap_horizon",      async () => lightThemingParams);
registerThemePropertiesLoader("@ui5/webcomponents",         "sap_horizon",      async () => lightBaseParams, "host");
registerThemePropertiesLoader("@ui5/webcomponents-fiori",   "sap_horizon",      async () => lightFioriParams, "host");

import "@ui5/webcomponents/dist/Card.js";
import "@ui5/webcomponents/dist/CardHeader.js";
import "@ui5/webcomponents/dist/Button.js";
import "@ui5/webcomponents/dist/Tag.js";
import "@ui5/webcomponents/dist/Title.js";
import "@ui5/webcomponents/dist/Icon.js";
import "@ui5/webcomponents/dist/BusyIndicator.js";
import "@ui5/webcomponents/dist/List.js";
import "@ui5/webcomponents/dist/ListItemStandard.js";
import "@ui5/webcomponents/dist/Table.js";
import "@ui5/webcomponents/dist/TableHeaderRow.js";
import "@ui5/webcomponents/dist/TableHeaderCell.js";
import "@ui5/webcomponents/dist/TableRow.js";
import "@ui5/webcomponents/dist/TableCell.js";
import "@ui5/webcomponents/dist/Bar.js";
import "@ui5/webcomponents/dist/ProgressIndicator.js";
import "@ui5/webcomponents-fiori/dist/IllustratedMessage.js";
import "@ui5/webcomponents-fiori/dist/illustrations/tnt/Tools.js";
import "@ui5/webcomponents-fiori/dist/illustrations/tnt/Settings.js";
import "@ui5/webcomponents-fiori/dist/illustrations/NoTasks.js";
import "@ui5/webcomponents-fiori/dist/illustrations/BeforeSearch.js";
import "@ui5/webcomponents-fiori/dist/illustrations/ReloadScreen.js";
import "@ui5/webcomponents-fiori/dist/illustrations/KeyTask.js";
import "@ui5/webcomponents-fiori/dist/illustrations/NoData.js";
import "@ui5/webcomponents-icons/dist/sys-enter-2.js";
import "@ui5/webcomponents-icons/dist/process.js";
import "@ui5/webcomponents-icons/dist/accept.js";
import "@ui5/webcomponents-icons/dist/alert.js";
import "@ui5/webcomponents-icons/dist/error.js";
import "@ui5/webcomponents-icons/dist/document.js";
import "@ui5/webcomponents-icons/dist/document-text.js";
import "@ui5/webcomponents-icons/dist/task.js";
import "@ui5/webcomponents-icons/dist/history.js";
import "@ui5/webcomponents-icons/dist/trend-up.js";
import "@ui5/webcomponents-icons/dist/source-code.js";
import "@ui5/webcomponents-icons/dist/developer-settings.js";
import "@ui5/webcomponents-icons/dist/download.js";
import "@ui5/webcomponents-icons/dist/combine.js";
import "@ui5/webcomponents-icons/dist/detail-view.js";

// Standalone / fallback default: dark. Overridden by handleHostContext on MCP connect.
// Must come AFTER all registerThemePropertiesLoader calls so the theme can resolve.
setTheme("sap_horizon_dark");

// ── Types ────────────────────────────────────────────────────────────────────

type PhaseStatus = "pending" | "running" | "testing" | "completed" | "failed";
type GateStatus = "idle" | "running" | "passed" | "failed";

interface PhaseState {
  id: number;
  name: string;
  description: string;
  status: PhaseStatus;
  gateStatus: GateStatus;
  gateDurationSeconds: number | null;
  gateTestsPassed: number | null;
  gateTestsTotal: number | null;
  gateNote: string | null;
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
  status: "idle" | "running" | "completed" | "stopped";
  project: string;
  projectPath: string;
  ui5Version: string;
  model: string;
  verificationMode: string;
  buildCommand: string;
  testCommand: string;
  workingTreeStatus: string;
  originalBranch: string | null;
  workBranch: string | null;
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
  stoppedAt: string | null;
  stopReason: string | null;
  phaseStartedAt: string | null;
  gitActivity: GitActivity | null;
  lastGitActivityAt: string | null;
  mergedAt: string | null;
  mergeStatus: "pending" | "merged" | "skipped" | null;
  stage: "started" | "linting" | null;
  lastOutcome: {
    kind: "reset" | "merged-cleared";
    originalBranch: string | null;
    workBranch: string | null;
    at: string;
  } | null;
  serverBuild: string | null;
}

// Build identity burned in at build time (vite define). Compared against the
// server's `serverBuild` to warn when the Desktop loads a stale runtime copy.
declare const __BUILD_VERSION__: string | undefined;
const UI_BUILD: string = typeof __BUILD_VERSION__ !== "undefined" ? __BUILD_VERSION__ : "dev";

// ── DOM refs ─────────────────────────────────────────────────────────────────

const screenIdle = document.getElementById("screen-idle")!;
const screenDashboard = document.getElementById("screen-dashboard")!;
const screenCompleted = document.getElementById("screen-completed")!;
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
  setTheme(ctx.theme === "light" ? "sap_horizon" : "sap_horizon_dark");
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
  const modes = (ctx as any).availableDisplayModes as string[] | undefined;
  if (modes) availableDisplayModes = modes;
  const dm = (ctx as any).displayMode as string | undefined;
  if (dm) currentDisplayMode = dm;
  syncFullscreenButtons();
}

// ── Fullscreen ──────────────────────────────────────────────────────────────
// Ready to use — add <ui5-button id="btn-fullscreen" icon="full-screen"
// design="Transparent"> to .dashboard-header in mcp-app.html and wire it with
// document.getElementById("btn-fullscreen")?.addEventListener("click", toggleFullscreen).
// Blocked by 3P feature gate 513873720 (epitaxyMcpAppPane) as of 2026-11-03.

let currentDisplayMode = "inline";
let availableDisplayModes: string[] = ["inline"];

function syncFullscreenButtons() {
  const isFullscreen = currentDisplayMode === "fullscreen";
  const icon = isFullscreen ? "exit-full-screen" : "full-screen";
  for (const id of ["btn-fullscreen", "btn-fullscreen-completed"]) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    (btn as any).icon = icon;
  }
}

async function toggleFullscreen() {
  const next = currentDisplayMode === "fullscreen" ? "inline" : "fullscreen";
  try {
    const res = await app.requestDisplayMode({ mode: next });
    currentDisplayMode = (res as any).mode ?? next;
  } catch {
    // host rejected
  }
  syncFullscreenButtons();
}

// Ask the host for a wider inline frame. Height is left to the host / content.
function requestPreferredWidth() {
  app.sendSizeChanged({ width: PREFERRED_WIDTH }).catch(() => {});
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
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
  }
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
    if (range === 0) return "var(--sapPositiveColor)";
    const ratio = (d - minDur) / range;
    if (ratio < 0.33) return "var(--sapPositiveColor)";
    if (ratio < 0.67) return "var(--sapCriticalElementColor)";
    return "var(--sapNegativeColor)";
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
      dur.style.color = phase.status === "failed" ? "var(--sapNegativeColor)" : durationColor(phase.durationSeconds);
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
      <span class="commit-phase" style="color:var(--sapInformativeColor)">live</span>
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
  const worktreeStatus = state.workingTreeStatus || "—";
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

  // Progress indicator
  const pct = state.overallProgress ?? 0;
  const progressEl = document.getElementById("progress-bar") as any;
  if (progressEl) {
    progressEl.value = pct;
    progressEl.displayValue = `${pct}%`;
  }

  // Status tag
  const isRunning = state.status === "running";
  const isGateRunning = state.phases?.some(p => p.gateStatus === "running");
  const isFailed = state.phases?.some(p => p.status === "failed" || p.gateStatus === "failed");
  const lastActive = state.lastGitActivityAt ? new Date(state.lastGitActivityAt).getTime() : null;
  const silentMs = lastActive !== null ? Date.now() - lastActive : null;
  const isWaiting = isRunning && silentMs !== null && silentMs > 90_000;
  const silentMin = silentMs !== null ? Math.round(silentMs / 60_000) : 0;
  const waitingText = silentMin >= 2 ? `Waiting... · ${silentMin}m ago` : "Waiting...";

  const statusEl = document.getElementById("phase-status");
  const statusText = document.getElementById("status-text");
  const statusBusy = document.getElementById("status-busy") as any;
  if (statusEl && statusText && statusBusy) {
    statusEl.className = "phase-status";
    if (isFailed) {
      statusText.textContent = "Failed";
      statusEl.classList.add("status-failed");
      statusBusy.active = false;
    } else if (isWaiting) {
      statusText.textContent = waitingText;
      statusEl.classList.add("status-waiting");
      statusBusy.active = false;
    } else if (isGateRunning) {
      statusText.textContent = "Gate running";
      statusBusy.active = true;
    } else if (isRunning) {
      statusText.textContent = "Running";
      statusBusy.active = true;
    } else {
      statusText.textContent = activePhase?.status ?? "—";
      statusBusy.active = false;
    }
  }

  syncLiveTimer(0, state.phaseStartedAt ?? null);

  // Derive counters from phases when top-level fields lag behind
  const baseline = state.totalFindings ?? state.linterBaseline ?? 0;
  let fixed = state.findingsFixed ?? 0;
  let remaining = state.findingsRemaining ?? baseline;
  let progress = pct;
  if (baseline > 0 && state.phases?.length) {
    const done = state.phases.filter(
      (p) => p.status === "completed" && typeof p.findingsAfter === "number"
    );
    if (done.length > 0) {
      const lastRemaining = done[done.length - 1].findingsAfter!;
      const derived = baseline - lastRemaining;
      if (derived > fixed) { fixed = derived; remaining = lastRemaining; }
      const derivedPct = Math.round((fixed / baseline) * 100);
      if (derivedPct > progress) progress = derivedPct;
    }
  }

  setText("stat-fixed", String(fixed));
  setText("stat-total", String(baseline));
  setText("stat-progress", `${progress}%`);
  const progressEl2 = document.getElementById("progress-bar") as any;
  if (progressEl2 && progress > pct) {
    progressEl2.value = progress;
    progressEl2.displayValue = `${progress}%`;
  }
  const commits = state.phases.filter((p) => p.commit).length;
  setText("stat-commits", String(commits));

  // Activity + live git file changes
  setText("activity-text", state.currentActivity || "—");
  renderGitActivity(state.gitActivity ?? null, state.phases);

  // Phase commit list
  buildPhaseCommits(state.phases, state.gitActivity ?? null);
}

function renderGateRow(p: PhaseState): string {
  // Only render when a gate actually ran (manual mode leaves gateStatus idle)
  if (p.gateStatus !== "passed" && p.gateStatus !== "failed") return "";

  const hasCounts = p.gateTestsTotal != null && p.gateTestsPassed != null;
  // Three visual states (themed ui5-icon, colored via the ps-gate-* class):
  //  - failed            → red (error icon)
  //  - passed, not all   → amber (alert icon) — gate green-lit, but not all tests passed
  //  - passed, all green  → green (sys-enter-2 icon)
  const partial = p.gateStatus === "passed" && hasCounts
    && (p.gateTestsPassed as number) < (p.gateTestsTotal as number);

  let cls: string, icon: string, label: string;
  if (p.gateStatus === "failed") {
    cls = "ps-gate-fail"; icon = "error";
    label = hasCounts ? `Gate: ${p.gateTestsPassed}/${p.gateTestsTotal} passed` : "Gate failed";
  } else if (partial) {
    cls = "ps-gate-warn"; icon = "alert";
    label = `Gate: ${p.gateTestsPassed}/${p.gateTestsTotal} Tests passed`;
  } else {
    cls = "ps-gate-pass"; icon = "sys-enter-2";
    label = hasCounts ? `Gate: ${p.gateTestsPassed}/${p.gateTestsTotal} Tests passed` : "Gate passed";
  }

  const dur = p.gateDurationSeconds != null ? formatElapsed(p.gateDurationSeconds) : "";
  const note = p.gateNote
    ? `<div class="ps-gate-note">→ ${escapeHtml(p.gateNote)}</div>`
    : "";
  // Gate detail as its own table row. The label cell (Phase column) spans across
  // Phase..Files so the label + note aren't cramped; the two covered cells are
  // marked as spacers (hidden via CSS). The gate duration sits in the Duration
  // column (last), with an empty Commit cell before it.
  return `<ui5-table-row class="ps-gate-row ${cls}">
      <ui5-table-cell></ui5-table-cell>
      <ui5-table-cell class="ps-gate-cell"><span class="ps-gate-label">${label} <ui5-icon name="${icon}" class="ps-gate-icon"></ui5-icon></span>${note}</ui5-table-cell>
      <ui5-table-cell class="ps-gate-spacer"></ui5-table-cell>
      <ui5-table-cell class="ps-gate-spacer"></ui5-table-cell>
      <ui5-table-cell></ui5-table-cell>
      <ui5-table-cell><span class="ps-gate-dur">${dur}</span></ui5-table-cell>
    </ui5-table-row>`;
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

  const stopped = state.status === "stopped";
  const baseline = state.linterBaseline ?? 0;
  const fixed = state.findingsFixed ?? Math.max(baseline - (state.findingsRemaining ?? baseline), 0);
  const remaining = state.findingsRemaining ?? Math.max(baseline - fixed, 0);

  // Header: switch title/icon/subline between a completed and a user-stopped run.
  setText("completed-title", stopped ? "Modernization Stopped" : "Modernization Complete");
  const headerIcon = document.getElementById("completed-icon");
  if (headerIcon) headerIcon.setAttribute("name", stopped ? "process" : "sys-enter-2");
  if (stopped) {
    const reason = state.stopReason?.trim() || "Stopped by user";
    setText("completed-sub", `${reason} — ${remaining} findings remaining, ${fixed} resolved in ${elapsed}`);
  } else {
    setText("completed-sub", `${baseline} findings resolved across ${commits} commits in ${elapsed}`);
  }

  // Stats
  const statsEl = document.getElementById("completed-stats")!;
  statsEl.innerHTML = `
    <ui5-card class="completed-stat">
      <div class="completed-stat-inner">
        <ui5-icon name="task" class="completed-stat-icon"></ui5-icon>
        <div>
          <div class="completed-stat-value ${stopped ? "" : "positive"}">${stopped ? remaining : baseline}</div>
          <div class="completed-stat-label">${stopped ? "findings remaining" : "findings resolved"}</div>
        </div>
      </div>
    </ui5-card>
    ${stopped ? `<ui5-card class="completed-stat">
      <div class="completed-stat-inner">
        <ui5-icon name="accept" class="completed-stat-icon"></ui5-icon>
        <div>
          <div class="completed-stat-value positive">${fixed}</div>
          <div class="completed-stat-label">findings resolved</div>
        </div>
      </div>
    </ui5-card>` : ""}
    <ui5-card class="completed-stat">
      <div class="completed-stat-inner">
        <ui5-icon name="document" class="completed-stat-icon"></ui5-icon>
        <div>
          <div class="completed-stat-value">${totalFiles}</div>
          <div class="completed-stat-label">files changed</div>
        </div>
      </div>
    </ui5-card>
    <ui5-card class="completed-stat">
      <div class="completed-stat-inner">
        <ui5-icon name="source-code" class="completed-stat-icon"></ui5-icon>
        <div>
          <div class="completed-stat-value">${commits}</div>
          <div class="completed-stat-label">commits</div>
        </div>
      </div>
    </ui5-card>`;

  // Phase summary (rows injected into the <ui5-table> declared in the HTML shell;
  // keep the slot="headerRow" child, replace only the body rows)
  const phasesEl = document.getElementById("completed-phases")!;
  phasesEl.querySelectorAll("ui5-table-row").forEach((r) => r.remove());
  const rowsHtml = state.phases.map((p) => {
    const fixed = (p.findingsBefore ?? 0) - (p.findingsAfter ?? 0);
    const dur = p.durationSeconds != null ? formatElapsed(p.durationSeconds) : "—";
    const row = `<ui5-table-row>
      <ui5-table-cell>${p.id}</ui5-table-cell>
      <ui5-table-cell>${escapeHtml(p.name)}</ui5-table-cell>
      <ui5-table-cell>${fixed > 0 ? `<span class="fixed">${fixed} fixed</span>` : `<span class="muted">—</span>`}</ui5-table-cell>
      <ui5-table-cell>${p.filesChanged != null ? `${p.filesChanged} files` : `<span class="muted">—</span>`}</ui5-table-cell>
      <ui5-table-cell>${p.commit ? `<span class="hash">${escapeHtml(p.commit)}</span>` : `<span class="muted">—</span>`}</ui5-table-cell>
      <ui5-table-cell>${dur}</ui5-table-cell>
    </ui5-table-row>`;
    return row + renderGateRow(p);
  }).join("");
  phasesEl.insertAdjacentHTML("beforeend", rowsHtml);

  // Deferred issues
  const issues = state.deferredIssues ?? [];
  const sectionEl = document.getElementById("section-issues") as HTMLElement;
  if (issues.length > 0) {
    sectionEl.style.display = "";
    setText("issues-count", String(issues.length));
    const issuesEl = document.getElementById("completed-issues")!;
    issuesEl.innerHTML = issues.map((issue) => `
      <div class="issue-row">
        <div class="issue-file"><ui5-icon name="document"></ui5-icon> ${escapeHtml(issue.file)}</div>
        <ui5-tag design="Critical" hide-state-icon>${escapeHtml(issue.rule)}</ui5-tag>
        <div class="issue-desc">${escapeHtml(issue.message)}${issue.reason ? ` <span class="issue-reason">→ ${escapeHtml(issue.reason)}</span>` : ""}</div>
      </div>`).join("");
  } else {
    sectionEl.style.display = "none";
  }

  // Links to report and issues files
  const linksEl = document.getElementById("completed-links")!;

  function linkCard(filePath: string | null | undefined, title: string, icon: string, sub: string) {
    // A stopped/partial run may not have written the report or issues file yet.
    if (!filePath) return "";
    const reportFile = filePath.split("/").pop() ?? "";
    const download = standaloneMode
      ? `http://localhost:3001/files/${encodeURIComponent(reportFile)}`
      : "";
    return `
    <ui5-card class="link-card">
      <div class="link-card-row">
        <button class="link-card-main" data-path="${escapeHtml(filePath)}" data-title="${escapeHtml(title)}">
          <ui5-icon name="${icon}" class="link-card-icon"></ui5-icon>
          <div class="link-card-text">
            <div class="link-card-title">${escapeHtml(title)}</div>
            <div class="link-card-sub">${escapeHtml(sub)}</div>
          </div>
        </button>${download ? `<a class="link-card-download" href="${escapeHtml(download)}" download title="Download"><ui5-icon name="download"></ui5-icon></a>` : ""}
      </div>
    </ui5-card>`;
  }

  linksEl.innerHTML =
    linkCard(state.reportPath, "MODERNIZATION-REPORT.md", "document-text", "Full phase breakdown & statistics") +
    linkCard(state.issuesPath, "MODERNIZATION-ISSUES.md", "alert", `${issues.length} deferred finding${issues.length !== 1 ? "s" : ""} for manual review`);

  linksEl.querySelectorAll<HTMLElement>(".link-card-main[data-path]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = btn.dataset.path ?? "";
      const t = btn.dataset.title ?? "File";
      openMarkdown(p, t);
    });
  });

  // Merge: offer to merge the work branch into the original branch.
  renderMergeStatus(state);

  // Reset: only offered when the run recorded a dedicated modernization branch.
  // renderResetButton handles the branch-present guard and inline confirmation.
  renderResetButton(state);
}

// Render the merge section on the completed screen.
// Three cases: clean (auto-merge ready), deferred (prompt user), gate failed (blocked).
function renderMergeStatus(state: ModernizationState, justMerged = false, force = false) {
  const mergeEl = document.getElementById("completed-merge")!;
  // Don't clobber an open inline-confirm row with a background poll re-render.
  if (!force && !justMerged && mergeEl.querySelector(".confirm-row")) return;
  if (!state.workBranch || !state.originalBranch || state.status === "stopped") {
    if (mergeEl.innerHTML !== "") { mergeEl.innerHTML = ""; mergeEl.removeAttribute("data-sig"); }
    return;
  }

  const phases = state.phases ?? [];
  const anyFailed = phases.some(p => p.status === "failed" || p.gateStatus === "failed");
  const hasDeferred = (state.deferredIssues?.length ?? 0) > 0;

  // Skip re-render when nothing visible changed — otherwise the 1.5s poll rebuilds
  // the merge button and a click landing in that window hits a detached element.
  const merged = state.mergeStatus === "merged" || justMerged;
  const sig = `${merged}|${anyFailed}|${hasDeferred}|${state.deferredIssues?.length ?? 0}|${state.workBranch}|${state.originalBranch}`;
  if (!force && !justMerged && mergeEl.getAttribute("data-sig") === sig) return;

  if (merged) {
    mergeEl.innerHTML = `
      <div class="merge-note merge-note-success">
        <ui5-icon name="combine"></ui5-icon>
        Merged <code>${escapeHtml(state.workBranch)}</code> into <code>${escapeHtml(state.originalBranch)}</code>.
      </div>`;
    mergeEl.setAttribute("data-sig", sig);
    return;
  }

  if (anyFailed) {
    mergeEl.innerHTML = `
      <div class="merge-note merge-note-blocked">
        <ui5-icon name="error"></ui5-icon>
        Auto-merge blocked — one or more verification gates failed. Review the failures first.
      </div>`;
    mergeEl.setAttribute("data-sig", sig);
    return;
  }

  const btnDesign = hasDeferred ? "Default" : "Emphasized";
  const note = hasDeferred
    ? `<div class="merge-note merge-note-warn">
        <ui5-icon name="alert"></ui5-icon>
        ${state.deferredIssues!.length} deferred issue${state.deferredIssues!.length !== 1 ? "s" : ""} — review before merging.
      </div>`
    : `<div class="merge-note merge-note-clean">
        <ui5-icon name="sys-enter-2"></ui5-icon>
        All gates passed — ready to merge.
      </div>`;

  mergeEl.innerHTML = `
    ${note}
    <ui5-button id="btn-merge-app" icon="combine" design="${btnDesign}">Merge into ${escapeHtml(state.originalBranch)}</ui5-button>`;
  mergeEl.setAttribute("data-sig", sig);
  document.getElementById("btn-merge-app")?.addEventListener("click", () => {
    // Only the deferred-issues case needs a confirmation (it merges unresolved work);
    // a clean merge runs straight away, matching the previous no-prompt behavior.
    if (hasDeferred) {
      confirmInline({
        container: mergeEl,
        question: `${state.deferredIssues!.length} unresolved issue${state.deferredIssues!.length !== 1 ? "s" : ""} — `
          + `merge into <code>${escapeHtml(state.originalBranch!)}</code> anyway?`,
        confirmLabel: `Merge anyway`,
        confirmDesign: "Emphasized",
        onConfirm: () => mergeApp(state),
        rewire: () => renderMergeStatus(state, false, true),
      });
    } else {
      mergeApp(state);
    }
  });
}

// Merge the modernization work branch into the original branch.
// Standalone/CLI → REST; Desktop → MCP tool.
// ── Reset / merge actions ─────────────────────────────────────────────────────
// Both buttons talk to the server the same way: REST in standalone/CLI, the MCP
// tool bridge in Desktop. The Desktop bridge can go stale after a server restart
// and then hang silently — so every call is bounded by a client-side timeout and
// every outcome is shown inline in the widget (not only via a dismissable alert).

const ACTION_TIMEOUT_MS = 15000;

function setActionStatus(kind: "working" | "ok" | "error", text: string) {
  const el = document.getElementById("completed-action-status");
  if (!el) return;
  el.className = `completed-action-status status-${kind}`;
  const icon = kind === "working" ? "" : kind === "ok" ? "✓ " : "⚠ ";
  el.textContent = `${icon}${text}`;
}

// Inline confirmation for destructive actions. window.confirm/alert are blocked
// inside the sandboxed Desktop MCP-app iframe (they return false with no dialog),
// which is why the reset/merge buttons appeared dead there. Instead we swap the
// action button for a "<question> [confirm] [Cancel]" row inside its own
// container. Confirm runs onConfirm (which takes over feedback via the action
// status line); Cancel restores the original button by calling rewire().
function confirmInline(opts: {
  container: HTMLElement;
  question: string;        // may contain <code>…</code> for branch names
  confirmLabel: string;
  confirmDesign?: string;  // ui5-button design, e.g. "Negative" | "Emphasized"
  onConfirm: () => void;
  rewire: () => void;      // re-renders the original button + its click handler
}): void {
  const { container, question, confirmLabel, confirmDesign = "Negative", onConfirm, rewire } = opts;
  container.innerHTML = `
    <div class="confirm-row">
      <span class="confirm-q">${question}</span>
      <div class="confirm-actions">
        <ui5-button id="confirm-yes" design="${confirmDesign}">${escapeHtml(confirmLabel)}</ui5-button>
        <ui5-button id="confirm-cancel" design="Transparent">Cancel</ui5-button>
      </div>
    </div>`;
  document.getElementById("confirm-yes")?.addEventListener("click", () => onConfirm());
  document.getElementById("confirm-cancel")?.addEventListener("click", () => rewire());
}

// Render the reset button + its click handler into #completed-reset. Shared by the
// initial completed render, the post-merge re-render, and the inline-confirm cancel
// path so all three produce an identical, correctly-wired button.
function renderResetButton(state: ModernizationState, force = false) {
  const resetEl = document.getElementById("completed-reset");
  if (!resetEl) return;
  // Don't clobber an open inline-confirm row with a background poll re-render —
  // only an explicit rewire (force) or the branch-absent case may replace it.
  if (!force && resetEl.querySelector(".confirm-row")) return;
  if (!(state.workBranch && state.originalBranch)) {
    if (resetEl.innerHTML !== "") { resetEl.innerHTML = ""; resetEl.removeAttribute("data-sig"); }
    return;
  }
  const merged = state.mergeStatus === "merged";
  const resetLabel = merged ? "Clear dashboard" : "Reset app to original state";
  // Skip the re-render when nothing visible changed — rewriting innerHTML on every
  // 1.5s poll destroys and recreates the button, so a click landing in that window
  // hits a detached element and is lost. Keeping the DOM stable fixes that.
  const sig = `${merged}|${state.workBranch}|${state.originalBranch}|${state.projectPath ?? ""}`;
  if (!force && resetEl.getAttribute("data-sig") === sig && resetEl.querySelector("#btn-reset-app")) return;
  const resetNote = merged
    ? `Merged into <code>${escapeHtml(state.originalBranch)}</code>. Clear the dashboard to start fresh.`
    : `Modernization ran on <code>${escapeHtml(state.workBranch)}</code>. `
      + `Reset switches <code>${escapeHtml(state.projectPath?.split("/").pop() ?? "the project")}</code> `
      + `back to <code>${escapeHtml(state.originalBranch)}</code>; your work stays on the branch as a backup.`;
  resetEl.innerHTML = `
    <div class="reset-note">${resetNote}</div>
    <ui5-button id="btn-reset-app" icon="history" design="Transparent">${resetLabel}</ui5-button>`;
  resetEl.setAttribute("data-sig", sig);
  document.getElementById("btn-reset-app")?.addEventListener("click", () => {
    confirmInline({
      container: resetEl,
      question: `Reset the app to its original state? The repository switches back to `
        + `<code>${escapeHtml(state.originalBranch!)}</code>; your work stays as a backup on `
        + `<code>${escapeHtml(state.workBranch!)}</code>.`,
      confirmLabel: resetLabel,
      onConfirm: () => resetApp(state),
      rewire: () => renderResetButton(state, true),
    });
  });
}

interface ActionOutcome { failed: boolean; message: string; }

// Returns {failed, message}; never throws. A timeout or dead bridge is reported
// as a failure with an explanatory message rather than a silent hang.
async function callAction(restPath: string, toolName: string): Promise<ActionOutcome> {
  try {
    if (standaloneMode) {
      const res = await fetch(`http://localhost:3001${restPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(ACTION_TIMEOUT_MS),
      });
      const data = await res.json().catch(() => ({}));
      return { failed: !res.ok || data?.ok === false, message: data?.message ?? `HTTP ${res.status}` };
    }
    const result = await app.callServerTool(
      { name: toolName, arguments: {} },
      { signal: AbortSignal.timeout(ACTION_TIMEOUT_MS) },
    ) as any;
    return { failed: result?.isError === true, message: result?.content?.[0]?.text ?? "" };
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === "TimeoutError";
    return {
      failed: true,
      message: timedOut
        ? "No response from the dashboard server (timed out). The connection may have dropped — "
          + "reopen the dashboard and try again, or ask the agent to run it."
        : `Could not reach the dashboard server: ${String(err)}`,
    };
  }
}

async function mergeApp(state: ModernizationState) {
  const btn = document.getElementById("btn-merge-app") as any;
  if (btn) { btn.disabled = true; }
  setActionStatus("working", `Merging into ${state.originalBranch}…`);

  const { failed, message } = await callAction("/api/merge-app", "merge-app");
  if (failed) {
    // Inline status is the only feedback channel — window.alert is blocked in the
    // sandboxed Desktop iframe. Re-render the merge section (force, since the confirm
    // path replaced the button with the confirm row) so the user can retry.
    setActionStatus("error", message || "Merge not performed.");
    renderMergeStatus(state, false, true);
    return;
  }

  setActionStatus("ok", message || `Merged into ${state.originalBranch}.`);
  // Success: update the merge section in-place (don't switch to idle).
  state.mergeStatus = "merged";
  renderMergeStatus(state, true);
  // Re-render the reset button to reflect post-merge state ("Clear dashboard").
  renderResetButton(state);
}

// Switch the repository back to the original branch, undoing the whole run.
// Work branch is kept as a backup. Confirmation is handled inline by the button
// handler (renderResetButton) before this runs — window.confirm is blocked in the
// sandboxed Desktop iframe.
async function resetApp(state: ModernizationState) {
  const btn = document.getElementById("btn-reset-app") as any;
  if (btn) { btn.disabled = true; }
  setActionStatus("working", `Switching back to ${state.originalBranch}…`);

  const { failed, message } = await callAction("/api/reset-app", "reset-app");
  if (failed) {
    // Inline status is the only feedback channel — window.alert is blocked in the
    // sandboxed Desktop iframe. Re-render the button (force, since the confirm path
    // replaced it with the confirm row) so the user can retry.
    setActionStatus("error", message || "Reset not performed.");
    renderResetButton(state, true);
    return;
  }

  // Success: the server set state to idle AND wrote a persistent lastOutcome, so the
  // confirmation survives a reload / second tab (renderIdle reads it from state). We
  // also set the transient outcome here for immediate feedback before the next poll.
  setActionStatus("ok", message || "Reset complete.");
  setIdleOutcome(outcomeMessage({
    kind: state.mergeStatus === "merged" ? "merged-cleared" : "reset",
    originalBranch: state.originalBranch ?? null,
    workBranch: state.workBranch ?? null,
    at: new Date().toISOString(),
  }));
}

// Override the idle screen's title + subtitle, and style it as a neutral / success
// / error / warning state with an optional action button. Used to repurpose the
// idle screen as a general status/confirmation surface (reset, merge+clear, stale
// run, server unreachable, …). Plain DOM writes — renderIdle decides what to show.
type IdleVariant = "neutral" | "success" | "error" | "warning";
interface IdleMessageOpts {
  title: string;
  subtitle: string;
  variant?: IdleVariant;
  hint?: boolean;
  illustration?: string;   // ui5-illustrated-message name, e.g. "NoTasks", "tnt/Settings"
  headerIcon?: string;     // ui5-icon name shown left of the title
  iconBlue?: boolean;      // force the header icon blue regardless of variant colour
  action?: { label: string; icon?: string; onClick: () => void };
}

function setIdleMessage(opts: IdleMessageOpts): void;
function setIdleMessage(title: string, subtitle: string): void; // back-compat overload
function setIdleMessage(a: string | IdleMessageOpts, b?: string): void {
  const opts: IdleMessageOpts = typeof a === "string"
    ? { title: a, subtitle: b ?? "", variant: "success" }
    : a;
  const variant: IdleVariant = opts.variant ?? "neutral";

  const titleEl = document.getElementById("idle-title-text");
  if (titleEl) titleEl.textContent = opts.title;
  const illus = document.getElementById("idle-illustration");
  if (illus) {
    illus.setAttribute("subtitle-text", opts.subtitle);
    if (opts.illustration) illus.setAttribute("name", opts.illustration);
  }

  // Variant class drives the accent colour (idle-<variant> on .idle-wrap).
  const wrap = document.getElementById("idle-wrap");
  if (wrap) {
    wrap.classList.remove("idle-neutral", "idle-success", "idle-error", "idle-warning");
    wrap.classList.add(`idle-${variant}`);
  }

  // Header icon left of the title — per-state glyph, coloured by the variant (or
  // forced blue when the spec pins a neutral-blue icon on a coloured screen).
  const hIcon = document.getElementById("idle-header-icon") as any;
  if (hIcon && opts.headerIcon) {
    hIcon.setAttribute("name", opts.headerIcon);
    hIcon.classList.toggle("icon-blue", !!opts.iconBlue);
  }

  // Hint line: shown by default only for neutral, unless explicitly overridden.
  const hint = document.getElementById("idle-hint");
  if (hint) hint.style.display = (opts.hint ?? variant === "neutral") ? "" : "none";

  // Optional action button (e.g. "Reset to main").
  const actionEl = document.getElementById("idle-action");
  if (actionEl) {
    actionEl.innerHTML = "";
    if (opts.action) {
      const btn = document.createElement("ui5-button") as any;
      btn.textContent = opts.action.label;
      if (opts.action.icon) btn.setAttribute("icon", opts.action.icon);
      btn.setAttribute("design", variant === "error" || variant === "warning" ? "Emphasized" : "Default");
      btn.addEventListener("click", opts.action.onClick);
      actionEl.appendChild(btn);
      actionEl.classList.remove("hidden");
    } else {
      actionEl.classList.add("hidden");
    }
  }
}

// Reset the idle screen to the plain "no modernization running" state (state 0:
// idle, no run active). Illustration NoTasks, blue detail-view icon, no button.
function resetIdleToReady(): void {
  setIdleMessage({
    title: "No modernization running",
    subtitle: "No modernization is currently running. Start one from a coding agent with /modernize-ui5-app.",
    variant: "neutral",
    illustration: "NoTasks",
    headerIcon: "detail-view",
    iconBlue: true,
    hint: false,
  });
}

// A transient outcome set by an action handler for IMMEDIATE feedback (before the
// next poll round-trips). The reload-safe source of truth is the server-written
// state.lastOutcome, read in renderIdle — this flag just avoids a one-poll flicker
// between the action and the server state coming back. Cleared when a new run starts.
let pendingIdleOutcome: IdleMessageOpts | null = null;

function setIdleOutcome(opts: IdleMessageOpts): void {
  pendingIdleOutcome = opts;
  setIdleMessage(opts);
  showScreen("idle");
}

// Build the idle-screen message for a server-persisted reset/clear outcome. This is
// what makes the confirmation survive a reload or a second tab: it comes from state,
// not from a client-only flag.
function outcomeMessage(outcome: NonNullable<ModernizationState["lastOutcome"]>): IdleMessageOpts {
  if (outcome.kind === "merged-cleared") {
    // State 5 — Merge success. Illustration KeyTask, combine icon (blue).
    return {
      title: "Successfully merged and cleaned up",
      subtitle: `“${outcome.workBranch}” was merged into “${outcome.originalBranch}”. The dashboard has been reset.`,
      variant: "success",
      illustration: "KeyTask",
      headerIcon: "combine",
      iconBlue: true,
      hint: false,
    };
  }
  // State 4 — Reset success. Illustration ReloadScreen, sys-enter-2 icon (green).
  return {
    title: "App is back to its original state",
    subtitle: `Reset to “${outcome.originalBranch}”. Your modernization is kept as a backup on branch “${outcome.workBranch}”.`,
    variant: "success",
    illustration: "ReloadScreen",
    headerIcon: "sys-enter-2",
    hint: false,
  };
}

// Decide what the idle screen shows, in priority order. Called from applyState's
// idle/stale branch and on REST-only error paths.
function renderIdle(state: ModernizationState | null): void {
  showScreen("idle");

  // State 7 — a general (non-connection) error reported in the state. Wired for a
  // future `status:"error"` / `state.error`; there is no server-side error status
  // yet, so this branch simply works once one lands. Distinct from state 6 below,
  // which is the client-only "can't reach the server" case.
  if (state && ((state.status as string) === "error" || (state as any).error)) {
    setIdleMessage({
      title: "An error occurred",
      subtitle: "Is the coding agent still running correctly? If so, restart the dashboard.",
      variant: "error",
      illustration: "NoData",
      headerIcon: "error",
      hint: false,
    });
    return;
  }

  // State 6 — a client-only error outcome (server unreachable) set only while there
  // is no reachable server state.
  if (pendingIdleOutcome?.variant === "error") { setIdleMessage(pendingIdleOutcome); return; }

  // Server-persisted reset/clear confirmation (states 4/5) — reload- and tab-safe.
  if (state?.lastOutcome) { setIdleMessage(outcomeMessage(state.lastOutcome)); return; }

  // Transient success outcome set this session (immediate feedback before the
  // server state round-trips).
  if (pendingIdleOutcome) { setIdleMessage(pendingIdleOutcome); return; }

  // Paused — status does not exist server-side yet; wired so it works once a future
  // `status:"paused"` (or state.paused) lands.
  const paused = state && ((state.status as string) === "paused" || (state as any).paused === true);
  if (paused) {
    setIdleMessage({
      title: "Paused",
      subtitle: "The modernization run is paused.",
      variant: "warning",
      illustration: "BeforeSearch",
      headerIcon: "alert",
      hint: false,
    });
    return;
  }

  // State 3 — Stale run (>24h): surface the interrupted run + offer a reset.
  const isStale = !!(state && state.status === "running" && state.startedAt
    && (Date.now() - new Date(state.startedAt).getTime()) > 24 * 60 * 60 * 1000);
  if (isStale && state) {
    const started = state.startedAt ? new Date(state.startedAt).toLocaleDateString("en-US") : "unknown";
    const canReset = !!(state.workBranch && state.originalBranch);
    setIdleMessage({
      title: `Run from ${started} interrupted`,
      subtitle: canReset
        ? `The run is stuck on “${state.workBranch}”. Reset to “${state.originalBranch}” to clean up — or restart the agent to continue.`
        : "The run appears interrupted. No backup branch recorded.",
      variant: "warning",
      illustration: "BeforeSearch",
      headerIcon: "alert",
      hint: false,
      action: canReset
        ? { label: `Reset to ${state.originalBranch}`, icon: "history", onClick: () => resetApp(state) }
        : undefined,
    });
    return;
  }

  // Early-run screens before the phase view exists. The skill sets an explicit
  // `stage` so this is unambiguous — no guessing from currentActivity. `started`
  // is pushed with open-dashboard, `linting` right before the baseline linter runs;
  // both arrive before any phases, and `stage` is dropped once phases exist. A
  // running state with no phases and no stage (older skill) still means a run is
  // under way, so default to the "started" screen rather than the idle-0 screen.
  if (state && state.status === "running"
      && (!Array.isArray(state.phases) || state.phases.length === 0)) {
    if (state.stage === "linting") {
      // State 2 — Linter running.
      setIdleMessage({
        title: "Linter analysis running…",
        subtitle: "The UI5 linter is scanning the app for all deprecations.",
        variant: "neutral",
        illustration: "tnt/Settings",
        headerIcon: "developer-settings",
        iconBlue: true,
        hint: false,
      });
    } else {
      // State 1 — Modernization started (stage:"started", or running-without-stage).
      setIdleMessage({
        title: "Modernization started",
        subtitle: "The agent has started the modernization workflow. The run will appear here.",
        variant: "neutral",
        illustration: "tnt/Settings",
        headerIcon: "process",
        iconBlue: true,
        hint: false,
      });
    }
    return;
  }

  // State 0 — no modernization running (plain idle, no outcome).
  resetIdleToReady();
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
    gateDurationSeconds: (p.gateDurationSeconds ?? null) as number | null,
    gateTestsPassed: (p.gateTestsPassed ?? null) as number | null,
    gateTestsTotal: (p.gateTestsTotal ?? null) as number | null,
    gateNote: (p.gateNote ?? null) as string | null,
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
// Handle for the delayed "show completed screen" transition. Must be cancellable:
// if a new run starts during the 1.5s delay, the stale timeout would otherwise fire
// and slam the old completed screen back over the fresh "started" screen.
let completedTransition: ReturnType<typeof setTimeout> | null = null;

// Show the UI build, and warn when the server runs a different build — the
// classic "Desktop loaded a stale runtime copy" symptom.
function renderBuildInfo(serverBuild: string | null) {
  const el = document.getElementById("build-info");
  if (!el) return;
  if (serverBuild && serverBuild !== UI_BUILD) {
    el.className = "build-info build-mismatch";
    el.textContent = `UI ${UI_BUILD} · server ${serverBuild} — Versionen weichen ab (Server veraltet?)`;
  } else {
    el.className = "build-info";
    el.textContent = `build ${UI_BUILD}`;
  }
}

function applyState(raw: unknown) {
  if (!raw || typeof raw !== "object") return;
  const state = raw as ModernizationState;

  renderBuildInfo(state.serverBuild ?? null);

  // Cancel a pending "switch to completed screen" transition whenever the incoming
  // state is no longer completed — otherwise a new run that starts during the 1.5s
  // delay gets overwritten when the stale timeout fires (old dashboard "sticks").
  if (completedTransition && state.status !== "completed") {
    clearTimeout(completedTransition);
    completedTransition = null;
  }

  // A fresh, valid state means the server is reachable again — drop a stale
  // "unreachable" error outcome. Success outcomes (reset/merge) are kept; they
  // are cleared only when a new run starts (see the running branch below).
  if (pendingIdleOutcome?.variant === "error") pendingIdleOutcome = null;

  if (Array.isArray(state.phases)) {
    state.phases = state.phases.map((p, i) =>
      normalizePhase(p as unknown as Record<string, unknown>, i)
    );
  }

  // Treat stale "running" state (startedAt > 24h ago) as idle to avoid phantom timers
  const isStale = state.status === "running" && state.startedAt
    && (Date.now() - new Date(state.startedAt).getTime()) > 24 * 60 * 60 * 1000;

  if (state.status === "idle" || !state.status || isStale) {
    stopLiveTimer();
    renderIdle(state);
  } else if (state.status === "running") {
    // A genuine new run supersedes any transient idle outcome (reset/merge/error).
    if (!isStale) pendingIdleOutcome = null;
    // Phase 0 (linter running): no phases pushed yet — the dashboard would be an
    // empty "PHASE — OF 0" shell, so show a neutral busy idle screen until the
    // first real phase state arrives.
    const noPhasesYet = (!Array.isArray(state.phases) || state.phases.length === 0)
      && (!state.currentPhase || state.currentPhase === 0);
    if (noPhasesYet) {
      stopLiveTimer();
      renderIdle(state);
      lastStatus = state.status;
      return;
    }
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
    // The brief "dashboard → completed" transition is only a nice touch when a live
    // run finishes (lastStatus was "running"). On a cold load / reload (lastStatus
    // null or already completed) jump straight to the completed screen — no 1.5s of
    // empty dashboard shell.
    if (lastStatus === "running") {
      showScreen("dashboard");
      renderDashboard(state);
      completedTransition = setTimeout(() => {
        completedTransition = null;
        showScreen("completed");
        renderCompleted(state);
      }, 1500);
    } else {
      showScreen("completed");
      renderCompleted(state);
    }
  } else if (state.status === "stopped") {
    stopLiveTimer();
    showScreen("completed");
    renderCompleted(state);
  }

  lastStatus = state.status;
}

// ── Live timer ────────────────────────────────────────────────────────────────
// Elapsed uses the server-owned startedAt and pauses on inactivity.
// A new run replaces the anchor; elapsedSeconds is not a clock source.

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
  const nextStart = Date.parse(startedAt);
  if (!Number.isFinite(nextStart)) { stopLiveTimer(); return; }
  timerStartedAt = nextStart;
  phaseTimerBase = phaseStartedAt ? Date.parse(phaseStartedAt) : 0;
  timerPausedAt = null;
  tickTimer();
  if (timerInterval) return;
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
  phaseTimerBase = phaseStartedAt ? Date.parse(phaseStartedAt) : 0;
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
let connectionLost = false;   // Desktop MCP bridge went dead; poll() drives a reconnect.
let reconnecting = false;     // guard so only one reconnect runs at a time.
let pollDelay = 1500;         // backs off while the connection is down.

// Show a small, honest connection indicator. In standalone (CLI) mode the bridge
// cannot "die" the same way, so this is primarily for the Desktop widget.
function setConnectionStatus(state: "ok" | "lost" | "reconnecting") {
  const el = document.getElementById("conn-status");
  if (!el) return;
  if (state === "ok") { el.textContent = ""; el.className = "conn-status"; return; }
  el.className = `conn-status conn-${state}`;
  el.textContent = state === "lost"
    ? "⚠ Lost connection to the dashboard server"
    : "… reconnecting";
}

// Desktop only: the MCP bridge does not reconnect itself. Re-run app.connect()
// once, and on success resume normal polling cadence.
async function reconnect() {
  if (reconnecting || standaloneMode) return;
  reconnecting = true;
  setConnectionStatus("reconnecting");
  try {
    await app.connect();
    connectionLost = false;
    pollDelay = 1500;
    setConnectionStatus("ok");
    if (!polling) startPolling();
  } catch {
    pollDelay = Math.min(pollDelay * 2, 8000); // back off, try again next tick
  } finally {
    reconnecting = false;
  }
}

async function poll() {
  if (!polling) return;
  try {
    if (standaloneMode) {
      const state = await fetchRestStatus();
      if (state) {
        applyState(state);
      } else if (!screenIdle.classList.contains("hidden")) {
        // REST stopped answering while the idle screen is up — surface it rather
        // than leaving a stale "Ready". A running/completed screen is left intact
        // (a single dropped poll shouldn't tear it down); the next good poll heals.
        setIdleOutcome({
          title: "Dashboard server unreachable",
          subtitle: "Connection to the status was interrupted. Retrying…",
          variant: "error",
          illustration: "NoData",
          headerIcon: "error",
          hint: false,
        });
      }
    } else {
      const result = await app.callServerTool(
        { name: "get-status", arguments: {} },
        { signal: AbortSignal.timeout(5000) },
      );
      applyState(result.structuredContent);
      if (connectionLost) { connectionLost = false; pollDelay = 1500; setConnectionStatus("ok"); }
    }
  } catch (err) {
    // A dead Desktop bridge surfaces here (timeout / send failure). Instead of
    // polling a corpse forever, flag it and drive a reconnect.
    if (!standaloneMode) {
      if (!connectionLost) { connectionLost = true; setConnectionStatus("lost"); }
      reconnect();
    } else {
      console.error("poll error:", err);
    }
  }
  if (polling) setTimeout(poll, pollDelay);
}

function startPolling() {
  if (polling) return;
  polling = true;
  poll();
}

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
  // Route through applyState so the early-run screens (started / linting / no-phases)
  // are chosen correctly — rendering the dashboard shell directly here showed an
  // empty "PHASE — OF 0" on reload during the pre-phase stage.
  if (state) applyState(state);
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
    // Bounded: if the bridge accepts the connection but never answers the first
    // call (observed on Desktop), do NOT await forever — fall through to REST and
    // still start polling, which re-tries (and reconnects) on its own cadence.
    const result = await app.callServerTool(
      { name: "get-status", arguments: {} },
      { signal: AbortSignal.timeout(5000) },
    );
    const state = result.structuredContent as ModernizationState | undefined;
    if (state) {
      // applyState picks the right screen (incl. early-run / idle); then poll.
      applyState(state);
      startPolling();
      desktopInitDone = true;
    }
  } catch {
    // get-status via MCP hung or failed — fall back to REST, and ensure polling runs.
  }

  if (!desktopInitDone) {
    // MCP get-status unavailable or returned idle — try REST as fallback
    const restState = await fetchRestStatus();
    if (restState) {
      applyState(restState);
      startPolling();
    } else {
      // Reached neither — begin polling; it retries on its own cadence.
      startPolling();
    }
  }
}).catch(async () => {
  // MCP app connection failed — running in standalone browser mode
  console.log("MCP app connection unavailable — using standalone REST polling");
  standaloneMode = true;

  const state = await fetchRestStatus();
  if (state) {
    applyState(state);
    startPolling();
  } else {
    // Neither MCP nor REST answered — the server is genuinely unreachable. Say so
    // instead of a blank "Ready" screen. Polling keeps retrying; a later success
    // clears this via a fresh state. (Desktop uses the conn-status strip instead.)
    setIdleOutcome({
      title: "Dashboard server unreachable",
      subtitle: "The status could not be loaded. Is the dashboard server running? Retrying…",
      variant: "error",
      illustration: "NoData",
      headerIcon: "error",
      hint: false,
    });
    startPolling();
  }
});
