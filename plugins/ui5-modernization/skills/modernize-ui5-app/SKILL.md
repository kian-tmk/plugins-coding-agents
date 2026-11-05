---
name: modernize-ui5-app
description: |
  End-to-end workflow for modernizing a UI5 application. Use this skill when:
  - User wants to modernize their UI5 app
  - User mentions "UI5 modernization", "modernize UI5 app", "upgrade UI5", "make app modern UI5 compatible"
  - User asks to "fix all linter errors", "run full modernization", "modernize my UI5 project"
  This skill runs the modernization in five phases with a verification gate after each phase. The user picks the verification mode once at the start (full autonomous / half autonomous / manual). The agent applies that mode at every gate without re-asking.
---

# UI5 Modernization Workflow

This skill modernizes a UI5 application in **five phases**, each followed by a **verification gate**. The user picks the gate behavior **once at the start** — full autonomous, half autonomous, or manual — and the orchestrator applies that choice at every phase boundary.

## The five phases

1. **Mechanical baseline** — autofix + test starter restructure. Low-risk, unlocks test runs.
2. **Foundation** — `manifest.json` and `Component.js`. Everything downstream reads the manifest.
3. **Module system & globals** — dependency graph (sap.ui.define arrays, lazy requires, no implicit globals). Cyclic-dep and blind-spot fixes belong here.
4. **Deprecated APIs** — pure name-for-name replacement. Safe after phase 3 stabilizes the graph.
5. **CSP compliance** — last, because it depends on every prior phase being CSP-clean.

A documentation pass writes `MODERNIZATION-REPORT.md` and `MODERNIZATION-ISSUES.md` after phase 5.

## Rule ID to Skill Mapping

| Rule ID | Skill | Phase |
|---------|-------|-------|
| `no-deprecated-theme` | `fix-bootstrap-params` | 4 |
| `no-outdated-manifest-version` | `fix-manifest-json` | 2 |
| `no-legacy-ui5-version-in-manifest` | `fix-manifest-json` | 2 |
| `no-deprecated-library` | `fix-manifest-json` (manifest) or `fix-bootstrap-params` (HTML) | 2 / 4 |
| `no-deprecated-component` | `fix-manifest-json` | 2 |
| `no-removed-manifest-property` | `fix-manifest-json` or `fix-component-async` | 2 |
| `async-component-flags` | `fix-component-async` | 2 |
| `no-globals` | `fix-xml-globals` (ALL XML) or `fix-js-globals` (JS — sap.*/jQuery.*) | 3 |
| `no-ambiguous-event-handler` | `fix-xml-globals` | 3 |
| `no-deprecated-control-renderer-declaration` | `fix-control-renderer` | 4 |
| `ui5-class-declaration` | `fix-control-renderer` | 4 |
| `no-pseudo-modules` | `fix-pseudo-modules` | 3 |
| `no-implicit-globals` | `fix-pseudo-modules` | 3 |
| `unsupported-api-usage` | `fix-partially-deprecated-apis` | 4 |
| `prefer-test-starter` | `modernize-test-starter` | 1 |
| `csp-unsafe-inline-script` | `fix-csp-compliance` | 5 |
| (structural) | `fix-cyclic-deps` | 3 |
| (runtime) | `fix-linter-blind-spots` | 3 |

### Disambiguating `no-deprecated-api`

| File Type | Message Contains | Skill | Phase |
|-----------|------------------|-------|-------|
| `.html` | "bootstrap parameter", "deprecated theme" | `fix-bootstrap-params` | 4 |
| `manifest.json` | "view type", "model type", "resources/js" | `fix-manifest-json` | 2 |
| `.js` | "Lib.init/Library.init" | `fix-library-init` | 4 |
| `.js` | "deprecated renderer", "apiVersion", "IconPool", "rerender" | `fix-control-renderer` | 4 |
| `.js` | "deprecated class/property/interface" | `fix-deprecated-controls` | 4 |
| `.js` | "registerControllerExtensions" or `sap.ui.controller` in manifest `sap.ui.controllerExtensions` | `fix-fiori-elements-extensions` | 4 |
| `.js` | "sap.ui.controller" NOT in manifest extensions | `fix-js-globals` (case 9) | 3 |
| `.js` | "jQuery.sap.declare", "jQuery.sap.require" | `fix-js-globals` (case 10) | 3 |
| `.js` | "getLibraryResourceBundle" | `fix-js-globals` | 3 |
| `.js` | "MessagePage" | `fix-deprecated-controls` | 4 |
| `.js` | "Parameters.get", "loadData", "Mobile.init", "createEntry", "View.create", "Fragment.load", "Router" | `fix-partially-deprecated-apis` | 4 |
| `.xml` | "native HTML", "SVG" | `fix-xml-native-html` | 4 |
| `.xml` | "visibleRowCountMode", row-mode attrs | `fix-table-row-mode` | 4 |
| `.xml` | "MessagePage" | `fix-deprecated-controls` | 4 |
| any | *(no match)* | Log to `MODERNIZATION-ISSUES.md` | — |

## Phase 0: Prerequisites and Mode Selection

### Prerequisite check

```bash
npx @ui5/linter --version || echo "ERROR: @ui5/linter not available"
```

If not installed, tell user to run `npm install --save-dev @ui5/linter` and stop.

### Non-interactive mode

If the prompt contains "Do not ask for confirmation" or similar: skip mode selection, skip gates, skip commits, skip documentation. Execute phases 1–5 sequentially without pausing.

### Ask the user once: which verification mode?

**Use the `AskUserQuestion` tool** (never a plain chat message) to present the mode selection. This renders a structured choice the user can navigate with keyboard.

Question: `"Welchen Verifikationsmodus möchtest du verwenden?"`

Options:
- **Full autonomous** — Tests laufen automatisch, Agent fixt Fehler selbst (max. 3 Versuche). Nur bei unbehebbaren Fehlern wird nachgefragt. Kann 2–5 Min. pro Phase dauern.
- **Half autonomous** — Tests laufen automatisch, Agent fixt nichts. Nach jeder Phase Ergebnis + warte auf "continue".
- **Manual** — Keine Tests, nur Linter-Check. Nach jeder Phase kurze Zusammenfassung + warte auf "continue". Schnellster Modus.

Save mode. Do not re-ask between phases.

### Build & test commands

Read `references/build-and-test-commands.md`. Chrome DevTools MCP must be connected (install via `/install-mcps` if needed).

- **`pom.xml` exists** → Maven. Use §1.3 (`mvn clean verify -P execute.qunit ...`) for gates.
- **No `pom.xml`** → npm. Use `package.json` scripts. Fallback: `npx @ui5/linter --details`.

## Dashboard Integration

The UI5 Modernization Dashboard shows live progress. The workflow **detects the host** and offers the matching view — the user is asked only one, host-appropriate question:
- **CLI** (`CLAUDE_CODE_ENTRYPOINT=cli`) → dashboard in the **browser** (`http://localhost:3001`).
- **Claude Code Desktop** (`CLAUDE_CODE_ENTRYPOINT` ≠ `cli`, e.g. `claude-desktop-3p`) → dashboard as a **native inline widget**. **IMPORTANT:** The desktop host renders widgets **only** for MCP servers registered in `claude_desktop_config.json` (app-config servers) — NOT for plugin-loaded servers. The plugin loads the dashboard server so that tools like `update-status` and `get-status` work, but for the widget to render, the server must ALSO be registered in the app config. The `setup-desktop-dashboard` tool handles this registration.

**Both views are fed the same way:** live updates are pushed through the **`update-status` MCP tool** (no HTTP, no port, no curl) — the dashboard server writes the state file inside its own process, reached over the already-open stdio MCP connection. This works identically in CLI and Desktop. The HTTP server on `:3001` is started **only in the CLI case**, and only to *serve the browser page* — not for pushing status. In the Desktop case no server and no port are needed (and the sandbox blocks port binding anyway); the host already loads the dashboard MCP server over stdio. Only the *display* differs (browser tab vs. native widget).

Integration is **optional and non-blocking** — if declined or unavailable the skill continues normally.

### Setup (once, in Phase 0)

After the prerequisite check and **before** asking for the verification mode, follow this **exact sequence** — do not combine steps, do not skip, do not reorder:

#### Host erkennen (vor Schritt A)

```bash
# cli → browser dashboard; anything else (e.g. claude-desktop-3p) → native desktop widget
if [ "$CLAUDE_CODE_ENTRYPOINT" = "cli" ]; then
  DASHBOARD_HOST="cli"
else
  DASHBOARD_HOST="desktop"
fi
echo "DASHBOARD_HOST: $DASHBOARD_HOST"
```

#### Dashboard-Frage (AskUserQuestion — Schritt A)

Call `AskUserQuestion` with exactly one question, matching `DASHBOARD_HOST`. Do NOT combine it with the verification mode question or any other question.

- If `DASHBOARD_HOST=cli` — Question: `"Möchtest du das Dashboard mit dem aktuellen Fortschritt im Browser angezeigt bekommen?"`
  Options: **Ja** — Dashboard im Browser öffnen (empfohlen) / **Nein** — Ohne Dashboard fortfahren
- If `DASHBOARD_HOST=desktop` — Question: `"Möchtest du das Dashboard mit dem aktuellen Fortschritt als Widget hier im Desktop angezeigt bekommen?"`
  Options: **Ja** — Dashboard-Widget öffnen (empfohlen) / **Nein** — Ohne Dashboard fortfahren

→ If **Nein**: set `DASHBOARD=false`, skip Steps 1–4. Go directly to the verification mode question.

→ If **Ja**: execute Steps 1–4 (server start + open the matching view), then go directly to the verification mode question.

#### Step 0D: Desktop app-config registration (Desktop only — before Steps 1–4)

**This step applies ONLY when `DASHBOARD_HOST=desktop` and the user answered Ja.** Skip it entirely for CLI.

The desktop host renders MCP App widgets **only** for servers registered in `claude_desktop_config.json` — plugin-loaded servers can receive tool calls but their widgets are NOT rendered. Before opening the dashboard widget, you MUST ensure the server is registered in the app config.

**Check** whether the dashboard server is already registered by calling the `setup-desktop-dashboard` tool (server `plugin_ui5-modernization_ui5-modernization-dashboard`) with the appropriate profile. The tool inspects the config and returns one of:

- `status: "configured"` → the server is already registered. Proceed to Step 4 (skip Steps 1–3 — no HTTP server needed in Desktop).
- `status: "waiting-for-quit"` → the registration is prepared. Tell the user:

  > Das Dashboard wird eingerichtet. Beende Claude einmal vollständig mit **⌘Q**. Die Einrichtung wird abgeschlossen und Claude automatisch wieder geöffnet — mit einem vorbereiteten Fortsetzungs-Chat.

  Then **stop**. Do not proceed with the workflow. The launchd helper will register the server, reopen Claude, and open a continuation chat. The workflow resumes from there.

- An error (e.g. "Expected one running Claude Desktop application") → tell the user and fall back to `DASHBOARD=false`. Continue without the dashboard.

**Profile detection:** Use `claude-3p` when the entrypoint contains `3p` (e.g. `claude-desktop-3p`), otherwise use `claude`.

```bash
if [ "$DASHBOARD_HOST" = "desktop" ]; then
  case "$CLAUDE_CODE_ENTRYPOINT" in
    *3p*) DESKTOP_PROFILE="claude-3p" ;;
    *)    DESKTOP_PROFILE="claude" ;;
  esac
fi
```

Call the tool with `profile` set to `$DESKTOP_PROFILE`, and optionally `projectPath` (the current project directory) and `resumeContext` (any already-agreed constraints like the verification mode) so the continuation chat picks up where you left off.

**IMPORTANT — common mistakes to avoid in Step 0D:**
- Do NOT skip this step for Desktop — without app-config registration the widget will not render, even though the tool calls work fine (they go through the plugin server)
- Do NOT manually edit `claude_desktop_config.json` — the `setup-desktop-dashboard` tool handles this safely (backup, atomic write, SHA verification)
- Do NOT proceed with the workflow after `waiting-for-quit` — the user must quit Claude first
- If the tool returns `configured`, you can go straight to Step 4 (reset + open-dashboard) — Steps 1–3 are CLI-only

#### Steps 1–4: Server starten und Ansicht öffnen

(See below.) Only run these if the user answered **Ja** to Schritt A. Steps 1–3 are **CLI only** (resolve dir, build, start HTTP server). Desktop skips Steps 1–3 entirely (the server is plugin-loaded + app-config registered via Step 0D) and goes straight to Step 4.

**IMPORTANT — common mistakes to avoid:**
- Do NOT bundle Schritt A and the verification mode into one `AskUserQuestion` call
- Do NOT start the HTTP server / bind :3001 in the desktop case — it is blocked by the sandbox and not needed; status flows through the `update-status` MCP tool
- Do NOT call `open-dashboard` in the desktop case without first ensuring the server is app-config registered (Step 0D) — the widget will not render otherwise
- Push status via the `update-status` MCP tool in BOTH hosts — never via curl to :3001
- The next question after Schritt A (and Steps 0D/1–4, if **Ja**) is always the verification mode — not another dashboard question

If the user answered **Ja** to Schritt A, execute the following steps in order, then proceed to the verification mode question:

#### Step 1: Resolve the dashboard directory

```bash
# Try git root first, then $HOME fallback
DASHBOARD_DIR="$(git rev-parse --show-toplevel 2>/dev/null)/apps/ui5-modernization-dashboard"
if [ ! -f "$DASHBOARD_DIR/main.ts" ]; then
  DASHBOARD_DIR="$HOME/plugins-coding-agents/apps/ui5-modernization-dashboard"
fi
if [ ! -f "$DASHBOARD_DIR/main.ts" ]; then
  echo "⚠ Dashboard-Verzeichnis nicht gefunden — Dashboard wird übersprungen."
  DASHBOARD=false
fi
```

#### Step 2: Ensure compiled server exists

```bash
if [ "$DASHBOARD" != "false" ] && [ ! -f "$DASHBOARD_DIR/dist-server/main.js" ]; then
  echo "⏳ Dashboard wird gebaut..."
  (cd "$DASHBOARD_DIR" && npm run build > "${TMPDIR:-/tmp}/ui5-dashboard-build.log" 2>&1)
  if [ ! -f "$DASHBOARD_DIR/dist-server/main.js" ]; then
    echo "⚠ Dashboard-Build fehlgeschlagen — Log: ${TMPDIR:-/tmp}/ui5-dashboard-build.log"
    DASHBOARD=false
  fi
fi
```

#### Step 3: Start the HTTP server — CLI only

The HTTP server on :3001 serves the **browser** view and is started **only in the CLI case**. In the desktop case the dashboard MCP server is already loaded by the host (stdio) and binding a port is blocked by the sandbox — so skip the server start entirely; status flows through the `update-status` MCP tool and the widget reads it via `get-status`.

```bash
if [ "$DASHBOARD" != "false" ] && [ "$DASHBOARD_HOST" = "cli" ]; then
  if curl -s http://localhost:3001/api/status > /dev/null 2>&1; then
    echo "✅ Dashboard-Server läuft bereits."
    DASHBOARD=true
  else
    node "$DASHBOARD_DIR/dist-server/main.js" > "${TMPDIR:-/tmp}/ui5-dashboard.log" 2>&1 &
    for i in 1 2 3 4 5; do
      sleep 1
      curl -s http://localhost:3001/api/status > /dev/null 2>&1 && break
    done
    if curl -s http://localhost:3001/api/status > /dev/null 2>&1; then
      DASHBOARD=true
    else
      echo "⚠ Dashboard-Server konnte nicht gestartet werden — Log: ${TMPDIR:-/tmp}/ui5-dashboard.log"
      DASHBOARD=false
    fi
  fi
fi
```

#### Step 4: Reset state and open the matching view

Reset the state via the **`reset-status` MCP tool** (works in both hosts — no HTTP/port needed): call the `reset-status` tool of the `ui5-modernization-dashboard` server once here, so the dashboard starts on the idle screen.

```bash
if [ "$DASHBOARD" = "true" ] && [ "$DASHBOARD_HOST" = "cli" ]; then
  echo "✅ Dashboard gestartet: http://localhost:3001"
  open http://localhost:3001 2>/dev/null || true
elif [ "$DASHBOARD" = "true" ]; then
  echo "✅ Dashboard-Widget wird im Desktop geöffnet."
fi
```

**Both hosts:** after resetting, deliver the first state via the `update-status` MCP tool (see the push convention below).

**Desktop only (`DASHBOARD_HOST=desktop`):** open the native widget by calling the **`open-dashboard`** tool on the **app-config registered** `ui5-modernization-dashboard` server (NOT the `plugin_ui5-modernization_ui5-modernization-dashboard` server — that is the plugin-loaded instance whose widgets are not rendered by the host). The `open-dashboard` tool carries the `_meta.ui` resource, so the host renders the dashboard panel inline. For subsequent status checks, use `get-status` instead — it reads without opening another widget. (The CLI case needs no such call — the browser tab is the view.)

> **Why two servers?** The plugin loads its own instance (`plugin_ui5-modernization_...`) — it handles tool calls but its widgets don't render. Step 0D registers a second instance (`ui5-modernization-dashboard`) in the app config — that one renders widgets. Both share the same state file (`~/.ui5-modernization-dashboard/state.json`), so updates via either server are visible in the widget. Use the app-config server name for `open-dashboard`; use either server for `update-status`/`get-status`.

After the dashboard setup, define the timer helpers used throughout the skill:

```bash
START_TS=$(date +%s)

elapsed_seconds() { echo $(( $(date +%s) - START_TS )); }

push_status() {
  [ "$DASHBOARD" = "true" ] || return 0
  local elapsed=$(elapsed_seconds)
  python3 -c "
import json, sys
d = json.loads(sys.argv[1])
d['elapsedSeconds'] = $elapsed
print(json.dumps(d))
" "$1" 2>/dev/null || printf '%s' "$1"
}
```

**Status is pushed through the `update-status` MCP tool — the SAME mechanism in both hosts (CLI and Desktop). There is no `curl`, no HTTP server, and no port involved in the push.** The `push_status` bash helper only *prepares* the payload (it injects `elapsedSeconds` and echoes the JSON object). To actually send it, you — the agent — call the `update-status` tool of the `ui5-modernization-dashboard` MCP server, passing the prepared JSON object as the tool `arguments`.

So each "push_status" step below is a two-move convention:
1. Run `push_status "{...payload...}"` in bash to get the enriched JSON (it prints the object to stdout).
2. Call the **`update-status` MCP tool** with that object as `arguments`.

In practice you can skip step 1 and call `update-status` directly with the payload when you don't need the `elapsedSeconds` enrichment. The call is fire-and-forget: a failed push must never abort the run, and you must never block waiting on it.

This replaces the old HTTP/curl push: it works in the desktop sandbox (which blocks port binding) because the MCP tool writes the state file inside the dashboard server process itself (reached over the already-open stdio connection), and it works in the CLI identically.

### Call sites

| When | Fields to include |
|---|---|
| After linter baseline (Phase 0) | `status:"running"`, `project`, `projectPath`, `ui5Version`, `linterBaseline`, `totalFindings`, `phases` (all pending — use exact schema below), `startedAt` |
| Each phase starts | `currentPhase`, phase N `status:"running"`, `phaseStartedAt`, `currentActivity` |
| Each sub-agent launched | `currentActivity` describing what is being fixed (e.g. `"Fixing manifest.json — no-outdated-manifest-version"`) |
| Each sub-agent returns | `currentActivity` with result summary (e.g. `"manifest.json fixed — 3 findings resolved"`) |
| After autofix / linter re-run | `findingsFixed`, `findingsRemaining`, `overallProgress`, `currentActivity` |
| Each phase ends (after commit) | phase N `status:"completed"`, `findingsAfter`, `filesChanged`, `commit`, `commitMessage`, `durationSeconds`, `findingsFixed`, `findingsRemaining`, `overallProgress` |
| Run complete (after docs commit) | `status:"completed"`, `completedAt`, `overallProgress:100`, `deferredIssues` |
| User stops the run early | Call the **`stop-status`** tool (optional `reason`) — do NOT push `status:"completed"`. Preserves remaining findings, phases and deferred issues on the end screen. |
| User asks to reset/undo | Call the **`reset-app`** tool — discards uncommitted changes, switches back to original branch, resets dashboard to idle. Never do manual git checkout/branch -D. |
| Run complete, clean (auto-merge) | Call the **`merge-app`** tool — merges work branch into original via `git merge --no-ff`. Do NOT merge manually. |

**Rule:** push `currentActivity` whenever the agent switches tasks — before launching a sub-agent, after it returns, before running the linter, before committing. Every meaningful action should be visible in the dashboard within seconds.

**Stopping early (user asks to stop/abort mid-run):** This is a specific, mandatory procedure — do NOT just end your turn, and do NOT call `reset-status` (that wipes the dashboard to idle and loses the stop context). Do exactly this, in order:

1. Stop any running sub-agent / background work first.
2. Call the **`stop-status`** MCP tool with a short `reason` (e.g. `{"reason":"Durch Nutzer gestoppt"}`). This sets `status:"stopped"` while preserving remaining findings, completed phases and deferred issues, so the dashboard shows the "Modernization Stopped" end screen with that data — and the reset button (because `originalBranch`/`workBranch` are already in the state).
3. Tell the user the run is stopped, which branch the work is on (`workBranch`), and that they can reset to `originalBranch` from the dashboard or by asking you.

Never push `status:"completed"` or `status:"idle"` for a user stop. It is fire-and-forget like the other pushes.

**Resetting (user asks to undo/reset the modernization):** Call the **`reset-app`** MCP tool (on the `ui5-modernization-dashboard` server). It reads `originalBranch`, `workBranch` and `projectPath` from the stored state, discards all uncommitted changes on the work branch (`git checkout . && git clean -fd`), switches back to `originalBranch`, and resets the dashboard to idle. Pass `{"removeWorkBranch": true}` to also delete the work branch. **Do NOT implement the reset manually** (no manual `git checkout main`, no manual `git branch -D`) — always use the tool, it handles edge cases and cleanup correctly.

**Critical — phase object must be fully updated on completion:** When a phase ends, the `phases` array must contain the updated phase object with all fields filled in (`status:"completed"`, `findingsAfter`, `filesChanged`, `commit`, `commitMessage`, `durationSeconds`). A push that only updates top-level fields like `findingsFixed` without updating the phase object will show `0 commits` and stale stats in the dashboard. Use python3 to mutate the phase in `$PHASES_JSON` before every phase-completion push (see Phase 1 example).

## Operating Principles

1. **Fix every error that has a mapped skill.** Volume is not a reason to defer.
2. **Phases are mandatory in order.** Phase 3 catches runtime patterns invisible to the linter — a zero-error report does NOT mean phase 3 is complete.
3. **Never auto-modernize sync→async when return type changes.** `sap.ui.xmlfragment()`, `sap.ui.component()`, `sap.ui.view()`, `sap.ui.controller()` (instantiation) → document in `MODERNIZATION-ISSUES.md`.
4. **`MODERNIZATION-ISSUES.md` is a last resort.** Valid: no skill exists, or a skill genuinely failed. Invalid: "~N remaining errors for rule X" while a skill exists.

## Git Commit Strategy

The run works on a dedicated `ui5-modernization-*` branch (created in Step 1.0); the user's original branch stays untouched and serves as the backup. On a clean run (all gates passed, no deferred issues), the agent auto-merges via the `merge-app` tool; otherwise the user merges from the dashboard or manually. To abort, the dashboard reset switches back to the original branch. One commit per phase, five total (plus documentation). Stage only files modified in that phase — never `git add -A`.

**Never stage:** `headless-chrome.json`, `pom.xml` (dev profile patch), `.gitignore` (local test infra).

| # | After Phase | Message |
|---|---|---|
| 1 | 1 | `chore: apply UI5 linter autofix and modernize test starter` |
| 2 | 2 | `fix: modernize manifest.json and Component.js` |
| 3 | 3 | `fix: modernize module system (globals, pseudo-modules, cycles, blind spots)` |
| 4 | 4 | `fix: replace deprecated UI5 APIs` |
| 5 | 5 | `fix: enforce CSP compliance` |
| 6 | Docs | `docs: add modernization report and issues` |

Skip commit if phase makes no changes.

## Phase 1: Mechanical Baseline

### Step 1.0: Create the modernization branch

Before any changes, move onto a dedicated branch so the user's original branch stays untouched. This is the backup: a reset is just a switch back, never a destructive `git reset`. Capture both branch names for the dashboard.

```bash
if git -C "$PROJECT_PATH" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  ORIGINAL_BRANCH=$(git -C "$PROJECT_PATH" rev-parse --abbrev-ref HEAD)
  WORK_BRANCH="ui5-modernization-$(date +%Y%m%d-%H%M%S)"
  git -C "$PROJECT_PATH" checkout -b "$WORK_BRANCH"
else
  ORIGINAL_BRANCH=""
  WORK_BRANCH=""
fi
# Persist the branch names so later steps (and the stop/reset flow) can read them
# even though each bash call is a fresh shell — $ORIGINAL_BRANCH does NOT survive
# between tool calls, so a file is the only reliable carrier.
printf '%s\n%s\n' "$ORIGINAL_BRANCH" "$WORK_BRANCH" > "${TMPDIR:-/tmp}/ui5-modernization-branches.txt"
cat "${TMPDIR:-/tmp}/ui5-modernization-branches.txt"
```

Not a git repo (or `$PROJECT_PATH` unknown) → leave both empty; the dashboard reset then declines cleanly instead of touching git. Any uncommitted changes travel onto the new branch with the checkout — that is fine. All phase commits below land on `$WORK_BRANCH`.

**Carry these two values forward.** `originalBranch` and `workBranch` MUST be present in the first `update-status` call (next step) and are what lets the dashboard show the reset button. Because bash variables do not survive between tool calls, read them back from the file above (line 1 = originalBranch, line 2 = workBranch) whenever you build a status payload directly. Omitting them silently disables reset.

### Step 1.1: Initial Analysis

```bash
npx @ui5/linter --details 2>&1 | tee "${TMPDIR:-/tmp}/ui5-linter-baseline.txt"
grep -c " error \| warning " "${TMPDIR:-/tmp}/ui5-linter-baseline.txt" || echo "0"
```

Parse: total errors/warnings, grouped by rule ID and file. Store for final comparison.

Push initial dashboard state after parsing the baseline. Read the two branch names back from the file written in Step 1.0 (they are not in this shell's variables yet):

```bash
ORIGINAL_BRANCH=$(sed -n '1p' "${TMPDIR:-/tmp}/ui5-modernization-branches.txt" 2>/dev/null)
WORK_BRANCH=$(sed -n '2p' "${TMPDIR:-/tmp}/ui5-modernization-branches.txt" 2>/dev/null)
push_status "{\"status\":\"running\",\"project\":\"$(basename $PROJECT_PATH)\",\"projectPath\":\"$PROJECT_PATH\",\"ui5Version\":\"$UI5_VERSION\",\"verificationMode\":\"$VERIFICATION_MODE\",\"originalBranch\":\"$ORIGINAL_BRANCH\",\"workBranch\":\"$WORK_BRANCH\",\"linterBaseline\":$BASELINE_COUNT,\"totalFindings\":$BASELINE_COUNT,\"findingsFixed\":0,\"findingsRemaining\":$BASELINE_COUNT,\"currentPhase\":0,\"overallProgress\":0,\"startedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"phases\":$PHASES_JSON}"
```

Where `$PHASES_JSON` is the phases array with all phases set to `"status":"pending"`, built from the linter output.

**Required phase object schema** — use these exact field names (the dashboard will break on `"phase"`/`"title"`):

```json
[
  {"id":1,"name":"Mechanical Baseline","description":"Autofix + test starter modernization","status":"pending","gateStatus":"idle","skills":["modernize-test-starter"],"findingsBefore":null,"findingsAfter":null,"filesChanged":null,"commit":null,"commitMessage":null,"durationSeconds":null,"gateDurationSeconds":null,"gateTestsPassed":null,"gateTestsTotal":null,"gateNote":null},
  {"id":2,"name":"Foundation","description":"manifest.json + Component.js","status":"pending","gateStatus":"idle","skills":["fix-manifest-json","fix-component-async"],"findingsBefore":null,"findingsAfter":null,"filesChanged":null,"commit":null,"commitMessage":null,"durationSeconds":null,"gateDurationSeconds":null,"gateTestsPassed":null,"gateTestsTotal":null,"gateNote":null},
  {"id":3,"name":"Module System & Globals","description":"JS globals, pseudo-modules, cycles, blind spots","status":"pending","gateStatus":"idle","skills":["fix-js-globals","fix-xml-globals","fix-pseudo-modules","fix-cyclic-deps","fix-linter-blind-spots"],"findingsBefore":null,"findingsAfter":null,"filesChanged":null,"commit":null,"commitMessage":null,"durationSeconds":null,"gateDurationSeconds":null,"gateTestsPassed":null,"gateTestsTotal":null,"gateNote":null},
  {"id":4,"name":"Deprecated APIs","description":"Replace deprecated APIs and themes","status":"pending","gateStatus":"idle","skills":["fix-bootstrap-params","fix-library-init","fix-control-renderer","fix-deprecated-controls","fix-partially-deprecated-apis","fix-table-row-mode","fix-xml-native-html","fix-fiori-elements-extensions"],"findingsBefore":null,"findingsAfter":null,"filesChanged":null,"commit":null,"commitMessage":null,"durationSeconds":null,"gateDurationSeconds":null,"gateTestsPassed":null,"gateTestsTotal":null,"gateNote":null},
  {"id":5,"name":"CSP Compliance","description":"Externalize inline scripts","status":"pending","gateStatus":"idle","skills":["fix-csp-compliance"],"findingsBefore":null,"findingsAfter":null,"filesChanged":null,"commit":null,"commitMessage":null,"durationSeconds":null,"gateDurationSeconds":null,"gateTestsPassed":null,"gateTestsTotal":null,"gateNote":null},
  {"id":6,"name":"Documentation","description":"Write modernization report and issues file","status":"pending","gateStatus":"idle","skills":[],"findingsBefore":null,"findingsAfter":null,"filesChanged":null,"commit":null,"commitMessage":null,"durationSeconds":null,"gateDurationSeconds":null,"gateTestsPassed":null,"gateTestsTotal":null,"gateNote":null}
]
```

When updating a phase (start/end), carry all fields forward — only change `status`, and fill in `findingsBefore`/`findingsAfter`/`filesChanged`/`commit`/`commitMessage`/`durationSeconds` as they become known. Gate fields (`gateStatus`/`gateDurationSeconds`/`gateTestsPassed`/`gateTestsTotal`/`gateNote`) are filled by the Verification Gate step.

### Step 1.2: Apply Autofix

Push phase start before applying autofix:

```bash
PHASE_1_STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
PHASES_JSON=$(echo "$PHASES_JSON" | python3 -c "
import json, sys
phases = json.load(sys.stdin)
for p in phases:
    if p['id'] == 1:
        p['status'] = 'running'
        p['findingsBefore'] = $BASELINE_COUNT
print(json.dumps(phases))
")
push_status "{\"status\":\"running\",\"currentPhase\":1,\"currentActivity\":\"Phase 1: Mechanical Baseline\",\"phaseStartedAt\":\"$PHASE_1_STARTED_AT\",\"phases\":$PHASES_JSON}"
```

```bash
npx @ui5/linter --fix
npx @ui5/linter --details 2>&1 | tee "${TMPDIR:-/tmp}/ui5-linter-post-autofix.txt"
```

Parse the post-autofix count and push it to the dashboard immediately:

```bash
POST_AUTOFIX_COUNT=$(grep -c " error \| warning " "${TMPDIR:-/tmp}/ui5-linter-post-autofix.txt" || echo "0")
FIXED_AUTOFIX=$((BASELINE_COUNT - POST_AUTOFIX_COUNT))
push_status "{\"status\":\"running\",\"currentPhase\":1,\"currentActivity\":\"Autofix complete — ${FIXED_AUTOFIX} findings resolved\",\"findingsFixed\":$FIXED_AUTOFIX,\"findingsRemaining\":$POST_AUTOFIX_COUNT,\"overallProgress\":$(( FIXED_AUTOFIX * 100 / BASELINE_COUNT )),\"phases\":$PHASES_JSON}"
```

### Step 1.3: Test Starter modernization

Push before launching:
```bash
push_status "{\"status\":\"running\",\"currentPhase\":1,\"currentActivity\":\"Modernizing test starter...\",\"phases\":$PHASES_JSON}"
```

Launch sub-agent with `modernize-test-starter`. Use custom prompt instructing it to: read the skill, run Phase 0 detection completely before changes, follow ALL phases, verify against the 14-item Completion Checklist.

Push after sub-agent returns:
```bash
push_status "{\"status\":\"running\",\"currentPhase\":1,\"currentActivity\":\"Test starter modernized — running linter check...\",\"phases\":$PHASES_JSON}"
```

### Phase 1 commit + gate

After committing, collect phase metrics and update the phase object to `completed`:

```bash
COMMIT_1=$(git rev-parse --short HEAD)
COMMIT_MSG_1=$(git log -1 --pretty=%s)
FILES_1=$(git diff-tree --no-commit-id -r --name-only HEAD | wc -l | tr -d ' ')
PHASE_START_TS=$(date -d "$PHASE_1_STARTED_AT" +%s 2>/dev/null || python3 -c "from datetime import datetime; print(int(datetime.fromisoformat('${PHASE_1_STARTED_AT}'.replace('Z','+00:00')).timestamp()))")
DURATION_1=$(( $(date +%s) - PHASE_START_TS ))

# Update phase 1 object to completed with all fields filled in
PHASES_JSON=$(echo "$PHASES_JSON" | python3 -c "
import json, sys
phases = json.load(sys.stdin)
for p in phases:
    if p['id'] == 1:
        p['status'] = 'completed'
        p['findingsAfter'] = $REMAINING_1
        p['filesChanged'] = $FILES_1
        p['commit'] = '$COMMIT_1'
        p['commitMessage'] = '$COMMIT_MSG_1'
        p['durationSeconds'] = $DURATION_1
print(json.dumps(phases))
")

push_status "{\"status\":\"running\",\"currentPhase\":1,\"currentActivity\":\"Phase 1 complete — gate running\",\"findingsFixed\":$FIXED_1,\"findingsRemaining\":$REMAINING_1,\"overallProgress\":$PROGRESS_1,\"phases\":$PHASES_JSON}"
```

## Phase 2: Foundation

### Step 2.1: manifest.json

Push phase start before launching sub-agents:

```bash
PHASE_2_STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
PHASES_JSON=$(echo "$PHASES_JSON" | python3 -c "
import json, sys
phases = json.load(sys.stdin)
for p in phases:
    if p['id'] == 2:
        p['status'] = 'running'
        p['findingsBefore'] = $REMAINING_1
print(json.dumps(phases))
")
push_status "{\"status\":\"running\",\"currentPhase\":2,\"currentActivity\":\"Phase 2: Foundation\",\"phaseStartedAt\":\"$PHASE_2_STARTED_AT\",\"phases\":$PHASES_JSON}"
```

**Important:** Always include `\"currentPhase\":2` in every Phase 2 `push_status` call — not just `currentActivity`. The dashboard uses `currentPhase` to highlight the active stepper step.

Push before launching the sub-agent:
```bash
push_status "{\"status\":\"running\",\"currentPhase\":2,\"currentActivity\":\"Fixing manifest.json...\",\"phases\":$PHASES_JSON}"
```

Launch sub-agent with `fix-manifest-json`. Pass all `manifest.json` errors from rules: `no-outdated-manifest-version`, `no-legacy-ui5-version-in-manifest`, `no-deprecated-library`, `no-deprecated-component`, `no-removed-manifest-property`, plus `no-deprecated-api` with "view type"/"model type"/"resources/js".

Push after sub-agent returns:
```bash
push_status "{\"status\":\"running\",\"currentPhase\":2,\"currentActivity\":\"manifest.json fixed — running Component.js fix...\",\"phases\":$PHASES_JSON}"
```

### Step 2.2: Component.js

Launch sub-agent with `fix-component-async`. Unconditional — apply even if linter didn't flag `async-component-flags` (the error only appears after manifest.json removes `async: true` from rootView).

### Step 2.3: Verify Component.js

Push before verification:
```bash
push_status "{\"status\":\"running\",\"currentPhase\":2,\"currentActivity\":\"Verifying Component.js async setup...\",\"phases\":$PHASES_JSON}"
```

If exit code 1, fix: `imported-interface` → remove from deps, use string literal; `interface-not-string` → replace variable with string; `missing-interface` → add to metadata. Re-run to confirm.

### Phase 2 commit + gate

After committing, collect phase metrics and update the phase object to `completed`:

```bash
COMMIT_2=$(git rev-parse --short HEAD)
COMMIT_MSG_2=$(git log -1 --pretty=%s)
FILES_2=$(git diff-tree --no-commit-id -r --name-only HEAD | wc -l | tr -d ' ')
PHASE_START_TS=$(date -d "$PHASE_2_STARTED_AT" +%s 2>/dev/null || python3 -c "from datetime import datetime; print(int(datetime.fromisoformat('${PHASE_2_STARTED_AT}'.replace('Z','+00:00')).timestamp()))")
DURATION_2=$(( $(date +%s) - PHASE_START_TS ))

PHASES_JSON=$(echo "$PHASES_JSON" | python3 -c "
import json, sys
phases = json.load(sys.stdin)
for p in phases:
    if p['id'] == 2:
        p['status'] = 'completed'
        p['findingsAfter'] = $REMAINING_2
        p['filesChanged'] = $FILES_2
        p['commit'] = '$COMMIT_2'
        p['commitMessage'] = '$COMMIT_MSG_2'
        p['durationSeconds'] = $DURATION_2
print(json.dumps(phases))
")

push_status "{\"status\":\"running\",\"currentPhase\":2,\"currentActivity\":\"Phase 2 complete — gate running\",\"findingsFixed\":$FIXED_2,\"findingsRemaining\":$REMAINING_2,\"overallProgress\":$PROGRESS_2,\"phases\":$PHASES_JSON}"
```

## Phase 3: Module System & Globals

**Strategy:** Three global/module skills run **in parallel** (different files). `fix-linter-blind-spots` and `fix-cyclic-deps` run **sequentially after** (need stable complete JS layer).

**Critical:** Always use sub-agents for Step 3.1. The `fix-js-globals` Key Rules are not in main-agent context.

Push phase start before launching sub-agents:

```bash
PHASE_3_STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
PHASES_JSON=$(echo "$PHASES_JSON" | python3 -c "
import json, sys
phases = json.load(sys.stdin)
for p in phases:
    if p['id'] == 3:
        p['status'] = 'running'
        p['findingsBefore'] = $REMAINING_2
print(json.dumps(phases))
")
push_status "{\"status\":\"running\",\"currentPhase\":3,\"currentActivity\":\"Phase 3: Module System & Globals\",\"phaseStartedAt\":\"$PHASE_3_STARTED_AT\",\"phases\":$PHASES_JSON}"
```

### Step 3.1: Parallel batch

Push before launching:
```bash
push_status "{\"status\":\"running\",\"currentPhase\":3,\"currentActivity\":\"Fixing JS globals, XML globals and pseudo-modules in parallel...\",\"phases\":$PHASES_JSON}"
```

Launch sub-agents in parallel (up to 8 concurrent):
- `fix-js-globals` for JS `no-globals` errors + routed `no-deprecated-api` cases
- `fix-pseudo-modules` for `no-pseudo-modules` / `no-implicit-globals`
- `fix-xml-globals` for ALL XML `no-globals` / `no-ambiguous-event-handler` (including app-namespace globals)

**Test resources are included** — same rules apply to `test/` files.

### Step 3.1b: Regression check

Push before re-run:
```bash
push_status "{\"status\":\"running\",\"currentPhase\":3,\"currentActivity\":\"Regression check after parallel batch...\",\"phases\":$PHASES_JSON}"
```

Re-run linter. If new errors appear for Step 3.1 rules, launch a second batch for those. Ignore errors belonging to other phases.

### Step 3.2: fix-linter-blind-spots

Push before launching:
```bash
push_status "{\"status\":\"running\",\"currentPhase\":3,\"currentActivity\":\"Fixing linter blind spots...\",\"phases\":$PHASES_JSON}"
```

Launch one sub-agent. Instruct it to: read the skill, read manifest for namespace, run `detect-blind-spots.js`, fix all patterns, re-run script to confirm zero total.

### Step 3.3: fix-cyclic-deps

Launch one sub-agent. Instruct it to: read the skill, build dependency graph, auto-fix 2-node cycles (lazy require), flag 3+ node chains in MODERNIZATION-ISSUES.md.

### Phase 3 commit + gate

Re-run linter to verify no regression before committing.

After committing, collect phase metrics and update the phase object to `completed`:

```bash
COMMIT_3=$(git rev-parse --short HEAD)
COMMIT_MSG_3=$(git log -1 --pretty=%s)
FILES_3=$(git diff-tree --no-commit-id -r --name-only HEAD | wc -l | tr -d ' ')
PHASE_START_TS=$(date -d "$PHASE_3_STARTED_AT" +%s 2>/dev/null || python3 -c "from datetime import datetime; print(int(datetime.fromisoformat('${PHASE_3_STARTED_AT}'.replace('Z','+00:00')).timestamp()))")
DURATION_3=$(( $(date +%s) - PHASE_START_TS ))

PHASES_JSON=$(echo "$PHASES_JSON" | python3 -c "
import json, sys
phases = json.load(sys.stdin)
for p in phases:
    if p['id'] == 3:
        p['status'] = 'completed'
        p['findingsAfter'] = $REMAINING_3
        p['filesChanged'] = $FILES_3
        p['commit'] = '$COMMIT_3'
        p['commitMessage'] = '$COMMIT_MSG_3'
        p['durationSeconds'] = $DURATION_3
print(json.dumps(phases))
")

push_status "{\"status\":\"running\",\"currentPhase\":3,\"currentActivity\":\"Phase 3 complete — gate running\",\"findingsFixed\":$FIXED_3,\"findingsRemaining\":$REMAINING_3,\"overallProgress\":$PROGRESS_3,\"phases\":$PHASES_JSON}"
```

## Phase 4: Deprecated APIs

**Strategy:** Skills target different rules/files → run **in parallel** by skill. Group errors by skill using the mapping tables, launch one sub-agent per file (or cluster).

Push phase start before launching sub-agents:

```bash
PHASE_4_STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
PHASES_JSON=$(echo "$PHASES_JSON" | python3 -c "
import json, sys
phases = json.load(sys.stdin)
for p in phases:
    if p['id'] == 4:
        p['status'] = 'running'
        p['findingsBefore'] = $REMAINING_3
print(json.dumps(phases))
")
push_status "{\"status\":\"running\",\"currentPhase\":4,\"currentActivity\":\"Phase 4: Deprecated APIs\",\"phaseStartedAt\":\"$PHASE_4_STARTED_AT\",\"phases\":$PHASES_JSON}"
```

### Execution

Launch sub-agents in parallel (up to 8 concurrent). Use the Sub-Agent Prompt Template. Group files by skill.

### Step 4.2: Regression check

Re-run linter. Second batch for new Phase 4 errors only.

### Phase 4 commit + gate

After committing, collect phase metrics and update the phase object to `completed`:

```bash
COMMIT_4=$(git rev-parse --short HEAD)
COMMIT_MSG_4=$(git log -1 --pretty=%s)
FILES_4=$(git diff-tree --no-commit-id -r --name-only HEAD | wc -l | tr -d ' ')
PHASE_START_TS=$(date -d "$PHASE_4_STARTED_AT" +%s 2>/dev/null || python3 -c "from datetime import datetime; print(int(datetime.fromisoformat('${PHASE_4_STARTED_AT}'.replace('Z','+00:00')).timestamp()))")
DURATION_4=$(( $(date +%s) - PHASE_START_TS ))

PHASES_JSON=$(echo "$PHASES_JSON" | python3 -c "
import json, sys
phases = json.load(sys.stdin)
for p in phases:
    if p['id'] == 4:
        p['status'] = 'completed'
        p['findingsAfter'] = $REMAINING_4
        p['filesChanged'] = $FILES_4
        p['commit'] = '$COMMIT_4'
        p['commitMessage'] = '$COMMIT_MSG_4'
        p['durationSeconds'] = $DURATION_4
print(json.dumps(phases))
")

push_status "{\"status\":\"running\",\"currentPhase\":4,\"currentActivity\":\"Phase 4 complete — gate running\",\"findingsFixed\":$FIXED_4,\"findingsRemaining\":$REMAINING_4,\"overallProgress\":$PROGRESS_4,\"phases\":$PHASES_JSON}"
```

## Phase 5: CSP Compliance

CSP comes last because earlier phases may introduce inline blocks.

**Critical: never delete inline scripts — always externalize.** Move inline code to `.js` file, replace with `<script src="...">`.

Push phase start before launching sub-agents:

```bash
PHASE_5_STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
PHASES_JSON=$(echo "$PHASES_JSON" | python3 -c "
import json, sys
phases = json.load(sys.stdin)
for p in phases:
    if p['id'] == 5:
        p['status'] = 'running'
        p['findingsBefore'] = $REMAINING_4
print(json.dumps(phases))
")
push_status "{\"status\":\"running\",\"currentPhase\":5,\"currentActivity\":\"Phase 5: CSP Compliance\",\"phaseStartedAt\":\"$PHASE_5_STARTED_AT\",\"phases\":$PHASES_JSON}"
```

Launch sub-agents for files with `csp-unsafe-inline-script`. Use template with `fix-csp-compliance`.

### Phase 5 commit + gate

Final linter run for error count.

After committing, collect phase metrics and update the phase object to `completed`:

```bash
COMMIT_5=$(git rev-parse --short HEAD)
COMMIT_MSG_5=$(git log -1 --pretty=%s)
FILES_5=$(git diff-tree --no-commit-id -r --name-only HEAD | wc -l | tr -d ' ')
PHASE_START_TS=$(date -d "$PHASE_5_STARTED_AT" +%s 2>/dev/null || python3 -c "from datetime import datetime; print(int(datetime.fromisoformat('${PHASE_5_STARTED_AT}'.replace('Z','+00:00')).timestamp()))")
DURATION_5=$(( $(date +%s) - PHASE_START_TS ))

PHASES_JSON=$(echo "$PHASES_JSON" | python3 -c "
import json, sys
phases = json.load(sys.stdin)
for p in phases:
    if p['id'] == 5:
        p['status'] = 'completed'
        p['findingsAfter'] = $REMAINING_5
        p['filesChanged'] = $FILES_5
        p['commit'] = '$COMMIT_5'
        p['commitMessage'] = '$COMMIT_MSG_5'
        p['durationSeconds'] = $DURATION_5
print(json.dumps(phases))
")

push_status "{\"status\":\"running\",\"currentPhase\":5,\"currentActivity\":\"Phase 5 complete — gate running\",\"findingsFixed\":$FIXED_5,\"findingsRemaining\":$REMAINING_5,\"overallProgress\":$PROGRESS_5,\"phases\":$PHASES_JSON}"
```

## Verification Gate

After every phase commit, run the gate matching the mode chosen in Phase 0. **Use 600000ms timeout** for all test commands.

Before starting the gate, set `gateStatus: "running"` on the current phase so the dashboard shows the gate circle. Also record the gate start time so the duration can be reported:

```bash
GATE_START=$(date +%s)
PHASES_JSON=$(echo "$PHASES_JSON" | python3 -c "
import json, sys
phases = json.load(sys.stdin)
for p in phases:
    if p['id'] == $CURRENT_PHASE:
        p['gateStatus'] = 'running'
print(json.dumps(phases))
")
push_status "{\"status\":\"running\",\"currentPhase\":$CURRENT_PHASE,\"currentActivity\":\"Phase $CURRENT_PHASE: Verification gate — tests laufen...\",\"phases\":$PHASES_JSON}"
```

After the gate completes, push the result — set `gateStatus` to `"passed"` or `"failed"` (leave `phase.status` unchanged). Also fill in `gateDurationSeconds` (elapsed since `$GATE_START`) and, when the test runner reports counts, `gateTestsPassed` / `gateTestsTotal`. These drive the gate line in the completed-screen phase summary (e.g. `Gate: 18/18 Tests passed ✅ 3m 04s`). Set `$GATE_PASSED` / `$GATE_TOTAL` from the sub-agent's test summary (`N passed`, `N+M+skipped` total); if the runner reports no counts, leave them unset and the dashboard shows just `Gate passed/failed`.

**When not every test is green, add a short `gateNote` explaining why.** The dashboard colours the gate line by outcome: all green → green ✅; `gateStatus:"passed"` but `gateTestsPassed < gateTestsTotal` → amber ⚠ (the gate was let through, but the user deserves to know which tests were skipped/tolerated and why); `failed` → red ❌. Whenever `gateTestsPassed < gateTestsTotal` (amber or red), set `$GATE_NOTE` to one short sentence — e.g. `"1 Test übersprungen: opaTests/Worklist nicht phasenbezogen"` or `"3 Tests fehlgeschlagen nach IllustratedMessage-Migration"`. When all tests pass, leave `$GATE_NOTE` empty:

```bash
GATE_DURATION=$(( $(date +%s) - GATE_START ))

# On pass:
PHASES_JSON=$(echo "$PHASES_JSON" | GATE_DURATION=$GATE_DURATION GATE_PASSED="$GATE_PASSED" GATE_TOTAL="$GATE_TOTAL" GATE_NOTE="$GATE_NOTE" python3 -c "
import json, sys, os
phases = json.load(sys.stdin)
for p in phases:
    if p['id'] == $CURRENT_PHASE:
        p['gateStatus'] = 'passed'
        p['gateDurationSeconds'] = int(os.environ['GATE_DURATION'])
        if os.environ.get('GATE_PASSED'): p['gateTestsPassed'] = int(os.environ['GATE_PASSED'])
        if os.environ.get('GATE_TOTAL'): p['gateTestsTotal'] = int(os.environ['GATE_TOTAL'])
        if os.environ.get('GATE_NOTE'): p['gateNote'] = os.environ['GATE_NOTE']
print(json.dumps(phases))
")
push_status "{\"status\":\"running\",\"currentPhase\":$CURRENT_PHASE,\"currentActivity\":\"Phase $CURRENT_PHASE: Tests bestanden ✅\",\"phases\":$PHASES_JSON}"

# On fail (after retries exhausted):
PHASES_JSON=$(echo "$PHASES_JSON" | GATE_DURATION=$GATE_DURATION GATE_PASSED="$GATE_PASSED" GATE_TOTAL="$GATE_TOTAL" GATE_NOTE="$GATE_NOTE" python3 -c "
import json, sys, os
phases = json.load(sys.stdin)
for p in phases:
    if p['id'] == $CURRENT_PHASE:
        p['gateStatus'] = 'failed'
        p['gateDurationSeconds'] = int(os.environ['GATE_DURATION'])
        if os.environ.get('GATE_PASSED'): p['gateTestsPassed'] = int(os.environ['GATE_PASSED'])
        if os.environ.get('GATE_TOTAL'): p['gateTestsTotal'] = int(os.environ['GATE_TOTAL'])
        if os.environ.get('GATE_NOTE'): p['gateNote'] = os.environ['GATE_NOTE']
print(json.dumps(phases))
")
push_status "{\"status\":\"running\",\"currentPhase\":$CURRENT_PHASE,\"currentActivity\":\"Phase $CURRENT_PHASE: Tests fehlgeschlagen ❌ — warte auf Nutzer\",\"phases\":$PHASES_JSON}"
```

### Full autonomous

**Delegate to a sub-agent.** Print `⏳ Phase {N} gate: launching test sub-agent...`

Sub-agent instructions:
1. Read `references/build-and-test-commands.md` → detect Maven vs npm
2. Run the test command (Maven §1.3 or npm test). **Linter-only is NOT verification** unless no test command exists.
3. **Maven: exit code 0 ≠ all tests passed.** Check output for failure summaries AND `target/surefire-reports/`.
4. On pass → report `✅ TESTS OK`
5. On fail → analyze, attempt minimal fix (broken import/path/assertion only — never modernize code), re-run. Stop after 3 retries or 1 failed debug.
6. **Scope constraint:** Only fix failing tests caused by current phase. Never apply other-phase modernizations.

After return: ✅ → push completed, proceed. ❌ → push failed, print summary, ask user.

When the sub-agent reports a test count (`N passed`, `M total`), set `GATE_PASSED=N` and `GATE_TOTAL=M` before the pass/fail push so the gate line shows `Gate: N/M Tests passed`. If no counts are available, leave them unset. When `N < M` (some tests skipped, tolerated, or failed), also set `GATE_NOTE` to one short sentence explaining why — this renders an amber (passed-but-not-all) or red (failed) explanation line instead of a misleading green ✅.

### Half autonomous

Same sub-agent but do NOT debug failures. Report results only:
```
✅/❌ Tests: N passed, N failed, N skipped
Failed test names (≤10)
```

Push result (completed or failed), then wait for user: "continue" / "skip phase" / "run tests" / "abort".

### Manual

Skip tests entirely. Do NOT push `testing` state — go directly from the phase-completion push to the next phase.

Print: `Phase {N} done. Files: {count}. Fixed: {count}. Deferred: {count}.`
Wait for user "continue".

## Sub-Agent Prompt Template (Phases 1–5)

```
Fix UI5 linter errors in the following file(s) using the {skill-name} skill.

Project root: {project-path}

File: {file-path}
Errors to fix:
{errors}

Instructions:
1. Read {skills-dir}/{skill-name}/SKILL.md
2. Pay special attention to "Key Rules" — load-bearing constraints from past failures.
3. Read reference files mentioned in the skill.
4. Read the affected file(s).
5. Apply fix patterns EXACTLY as documented.
6. Verify each error is resolved.
7. Report: files modified, errors fixed, unfixable errors ({file}:{line} | {rule} | {reason}).
```

### Sub-agent execution rules

- **Foreground mode only.** Launch all sub-agents for a phase step in a SINGLE message — blocks until all return.
- **Cap ~8 concurrent per message.** Batch sequentially if more — do NOT stop after one batch.
- **Group related files** (controller + its XML view) into one sub-agent.
- **No validation between batches within a phase step.** Checks happen AFTER phase step completes.
- **Every file with a mapped error MUST be processed.**

### Per-phase skill dispatch

| Phase | Skills |
|-------|--------|
| 1 | `modernize-test-starter` |
| 2 | `fix-manifest-json`, `fix-component-async` |
| 3 (parallel) | `fix-js-globals`, `fix-pseudo-modules`, `fix-xml-globals` |
| 3 (sequential) | `fix-linter-blind-spots`, `fix-cyclic-deps` |
| 4 | `fix-bootstrap-params`, `fix-library-init`, `fix-control-renderer`, `fix-deprecated-controls`, `fix-fiori-elements-extensions`, `fix-partially-deprecated-apis`, `fix-table-row-mode`, `fix-xml-native-html` |
| 5 | `fix-csp-compliance` |
| 6 | *(no sub-agents — write docs directly)* |

## Documentation Phase (after Phase 5)

Push phase 6 start:

```bash
push_status "{\"status\":\"running\",\"currentPhase\":6,\"currentActivity\":\"Phase 6: Documentation\",\"phaseStartedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"phases\":$PHASES_JSON}"
```

Create `MODERNIZATION-ISSUES.md` and `MODERNIZATION-REPORT.md` using templates in `references/documentation-templates.md`.

Commit: `docs: add modernization report and issues`

Push run completion after the docs commit:

```bash
push_status "{\"status\":\"completed\",\"currentActivity\":\"Modernization complete\",\"overallProgress\":100,\"completedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"findingsFixed\":$FIXED_TOTAL,\"findingsRemaining\":0,\"reportPath\":\"$PROJECT_PATH/MODERNIZATION-REPORT.md\",\"issuesPath\":\"$PROJECT_PATH/MODERNIZATION-ISSUES.md\",\"phases\":$PHASES_JSON,\"deferredIssues\":$DEFERRED_JSON}"
```

## Post-Completion: Merge

After pushing `status:"completed"`, evaluate the merge conditions:

**Case 1 — Clean run:** All gates passed, 0 deferred issues, 0 findings remaining.
→ Call the **`merge-app`** tool. Inform user: "Merged {workBranch} into {originalBranch}."

**Case 2 — Deferred issues:** Gates passed, but `deferredIssues` non-empty.
→ Do NOT auto-merge. Inform user about deferred issues. The dashboard shows a merge button so the user can merge after reviewing.

**Case 3 — Gate failed:** Any phase has `gateStatus:"failed"`.
→ Do NOT merge. Inform user about failures.

**Critical:** Always use the `merge-app` tool, never `git merge` manually. The tool validates preconditions, creates the merge commit message, and updates the dashboard state.

## Context Management

The main agent never reads child skill files — only sub-agents do.

1. **Never read child skills.** Routing table tells you which skill; sub-agent reads its own.
2. **Parse and discard linter output.** Give each sub-agent only its filtered errors.
3. **Compress sub-agent results.** Keep: count fixed, unfixable errors, files modified.
4. **Prioritize completion.** If context runs low, finish Phase 5. Skip documentation if needed.

## Error Handling

If a fix genuinely fails: log, add to MODERNIZATION-ISSUES.md, continue with next error.

## Completion Checklist

- [ ] User picked verification mode in Phase 0; agent did not re-ask
- [ ] Each of phases 1–5 has a commit (or was skipped — no changes)
- [ ] Verification gate ran after every phase per chosen mode
- [ ] Phase 3 ran ALL three steps (parallel + blind-spots + cycles), even if linter showed 0 after batch
- [ ] Sub-agents launched in foreground, single-message batches
- [ ] Files staged per-phase (no `git add -A`)
- [ ] MODERNIZATION-ISSUES.md contains only genuinely unfixable errors
