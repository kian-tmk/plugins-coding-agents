# UI5 Modernization Dashboard — Architektur & Stand

> Stand: 2026-11-03. Diese Datei hält den Gesamtstand der MCP-App fest: wie die Teile
> zusammenspielen, welche Daten fließen und was die App heute kann.
>
> **Pflege-Konvention:** Bei jeder nennenswerten Änderung am Dashboard (Datenfluss,
> State-Schema, Screens, Features) zwei Dinge tun: (1) den betroffenen Abschnitt oben
> aktualisieren und (2) einen Eintrag unten im **Changelog** ergänzen (neueste zuerst,
> ISO-Datum, kurz und faktisch). So bleibt der Stand nachvollziehbar, auch über
> Session- und Werkzeuggrenzen hinweg — diese Datei ist das Gedächtnis, nicht der Chat.

## Was die App ist

Ein **Fortschritts-Dashboard für die UI5-Modernisierung**. Während der
`modernize-ui5-app`-Workflow eine UI5-App modernisiert, pusht er laufend
Status-Updates, die diese App live als Dashboard rendert — als eingebettetes
Panel in **Claude Desktop** (MCP App) und/oder als Seite im **Browser**
(`http://localhost:3001`).

Die App zeigt **keine** eigene Logik der Modernisierung — sie ist reine
Anzeige. Die einzige Quelle der Wahrheit ist eine State-Datei, die der Workflow
beschreibt und die App liest.

## Verzeichnis-Layout

```
apps/ui5-modernization-dashboard/
├── main.ts                 # Server-Einstieg: HTTP- + stdio-Transport, Git-Polling, REST-API
├── server.ts               # MCP-Server-Fabrik: registriert Tools + UI-Resource
├── state-store.ts          # Atomare State-Persistenz (~/.ui5-modernization-dashboard/state.json)
├── state-schema.ts         # Zod-Schemas für State- und Update-Validierung
├── server.test.ts          # Regressionstests (Widget-Tool-Count, Schema-Survival)
├── mcp-app.html            # UI-Grundgerüst (Screens, statische IDs)
├── src/
│   ├── mcp-app.ts          # UI-Logik: State lesen, rendern, Live-Timer, Polling
│   └── mcp-app.css         # Styling
├── desktop-setup.mjs       # macOS Claude Desktop MCP-Registrierung (launchd-basiert, dependency-frei)
├── desktop-setup-worker.mjs # launchd-Worker für desktop-setup
├── desktop-setup.d.mts     # TypeScript-Deklarationen für desktop-setup
├── desktop-setup.test.mjs  # Unit-Tests (11 Tests)
├── scripts/
│   ├── copy-to-plugin.mjs  # Artefakte nach plugins/ui5-modernization/dashboard/ kopieren
│   └── test-desktop-setup-launchd.mjs  # Integrationstest (launchd end-to-end)
├── dist/                   # BUILD-OUTPUT (gitignored): gebündelte mcp-app.html (alles inline)
├── dist-server/            # BUILD-OUTPUT (gitignored): kompilierte main.js + server.js
├── vite.config.ts          # baut src/* + mcp-app.html → dist/mcp-app.html (single file)
├── tsconfig.server.json    # kompiliert main.ts + server.ts → dist-server/
└── modernization-history/  # Beispiel-Reports aus früheren Läufen (Referenz/Fixtures)
```

## Die drei beweglichen Teile

### 1. Der State (einzige Quelle der Wahrheit)

Eine JSON-Datei unter **`~/.ui5-modernization-dashboard/state.json`** (fester
Home-Directory-Pfad, unabhängig von TMPDIR/Sandbox). Alles, was das Dashboard
zeigt, steht hier drin. Lesen/Schreiben passiert über `state-store.ts` (atomare
Writes via tmp+rename), `server.ts` (`writeState` für Timestamp-Management) und
`main.ts` (Git-Polling).

Wichtigste Felder (TypeScript-Schema: `ModernizationState` in `src/mcp-app.ts`):

| Feld | Bedeutung |
|---|---|
| `status` | `"idle"` \| `"running"` \| `"completed"` \| `"stopped"` — steuert, welcher Screen gezeigt wird |
| `project`, `projectPath`, `ui5Version`, `verificationMode`, `workingTreeStatus` | Preflight-Infos im Kopf |
| `linterBaseline`, `totalFindings`, `findingsFixed`, `findingsRemaining` | Finding-Zähler |
| `currentPhase`, `currentActivity`, `overallProgress` | aktueller Fortschritt |
| `startedAt`, `phaseStartedAt`, `completedAt`, `stoppedAt`, `elapsedSeconds` | Zeitanker für die Timer |
| `phases[]` | die 6 Phasen (siehe unten) |
| `deferredIssues[]` | zurückgestellte Findings (Completed-Screen) |
| `reportPath`, `issuesPath` | absolute Pfade zu MODERNIZATION-REPORT.md / -ISSUES.md |
| `gitActivity`, `lastGitActivityAt` | vom Server-Polling befüllt (nicht vom Workflow) |

**Phasen-Objekt** (`PhaseState`), pro Eintrag in `phases[]`:
`id`, `name`, `description`, `status` (`pending`/`running`/`testing`/`completed`/`failed`),
`gateStatus` (`idle`/`running`/`passed`/`failed`), `findingsBefore`, `findingsAfter`,
`filesChanged`, `commit`, `commitMessage`, `skills[]`, `durationSeconds`,
sowie die Gate-Felder `gateDurationSeconds`, `gateTestsPassed`, `gateTestsTotal`, `gateNote`.

> **Schema-Falle:** Die Phasen-Objekte MÜSSEN `id` und `name` heißen. `normalizePhase`
> fängt altes `phase`/`title` noch ab, aber der Workflow muss `id`/`name` pushen.

### 2. Der Server (`main.ts` + `server.ts`)

Ein Node-Prozess, der in **zwei Modi** laufen kann — beide bedienen denselben State:

- **HTTP-Modus** (Default, `node dist-server/main.js`): Express auf Port **3001**.
  Dient dem **Browser**. Macht zusätzlich das **Git-Polling** (alle 5 s, nur in
  diesem Modus): liest Commits seit `startedAt` und aktuell geänderte/neue Dateien
  aus `projectPath` und schreibt sie als `gitActivity` zurück in den State.
- **stdio-Modus** (`node dist-server/main.js --stdio`): für **Claude Desktop** als
  MCP-Server. Kein Git-Polling (deshalb kommt die Git-Aktivität im Desktop-Panel
  nur herein, wenn parallel der HTTP-Server läuft und sie in den State schreibt).

**HTTP-Endpunkte** (nur HTTP-Modus):
- `GET /` → liefert `dist/mcp-app.html`
- `GET /api/status` → aktueller State (JSON); startet bei `running` das Git-Polling
- `POST /api/reset` → State auf idle, stoppt Polling
- `GET /files/:filename` → rendert eine .md-Datei (Report/Issues) als HTML-Seite
- `ALL /mcp` → MCP-Protokoll über HTTP

**MCP-Tools** (`server.ts`, in beiden Modi verfügbar):
- `open-dashboard` — Dashboard-Widget öffnen (einziges Tool mit `_meta.ui`); gibt aktuellen State zurück
- `get-status` — aktuellen State lesen OHNE Widget zu öffnen (für Polling und Agent-Status-Checks)
- `update-status` — Partial-State mergen (der Workflow pusht hierüber); Server verwaltet Zeitstempel (`startedAt`, `phaseStartedAt`, `completedAt`, `stoppedAt`)
- `reset-status` — State auf idle
- `stop-status` — Run als gestoppt markieren (`status:"stopped"`), dabei Fortschrittsdaten erhalten (Phasen, Findings, deferred Issues). Für User-Abbruch, nicht für `reset`
- `reset-app` — Gesamten Modernisierungslauf rückgängig machen: verwirft uncommitted Changes auf dem Work-Branch (`git checkout . && git clean -fd`), wechselt zurück auf den Original-Branch, setzt Dashboard auf idle. Optional: Work-Branch löschen (`removeWorkBranch: true`)
- `get-file` — eine .md-Datei per absolutem Pfad lesen (für die Markdown-Anzeige im Desktop)
- `setup-desktop-dashboard` — (nur macOS, gated durch `enableDesktopSetup`-Flag) MCP-Server-Registrierung in Claude Desktop Config vorbereiten; launchd-Helper wartet auf User-Quit
- Resource `ui://ui5-modernization/mcp-app.html` — die UI selbst

### 3. Die UI (`src/mcp-app.ts` + `mcp-app.html` + `mcp-app.css`)

Eine Single-Page-App mit vier Screens, umgeschaltet nach `state.status`.
Seit 2026-10-22 nutzt die gesamte UI **UI5 Web Components** (`@ui5/webcomponents`,
`@ui5/webcomponents-fiori`, `@ui5/webcomponents-icons`). Die Controls werden als
ES-Module importiert (keine `Assets.js`); beide Themes (`sap_horizon`, `sap_horizon_dark`)
sind per `registerThemePropertiesLoader` registriert. `setTheme` schaltet nach
Host-Theme (`light`/`dark`) um.

- **Idle** — `ui5-illustrated-message` (`tnt/Tools`) + `ui5-busy-indicator`; title includes
  `developer-settings` icon in `--sapLinkColor`.
- **Dashboard (running)** — `ui5-bar` (Header), `ui5-card` (Preflight, Stepper-Wrapper,
  Phase-Info, Stats, Activity), `ui5-progress-indicator`, `ui5-tag` (Status),
  `ui5-icon` (task/history/trend-up/source-code), `ui5-card-header`.
  Stepper: Custom-Aufbau in `ui5-card`; Farben über SAP-Theme-Tokens
  (`--sapPositiveColor`, `--sapCriticalElementColor`, `--sapNegativeColor`, `--sapInformativeColor`).
- **Completed** — `ui5-card`, `ui5-table`/`ui5-table-row`/`ui5-table-cell` (Phase-Summary,
  explicit column widths; Spaltenreihenfolge `# / Phase / Fixed / Files / Commit / Duration`,
  die Duration-Spalte rechtsbündig — Werte, Gate-Dauern und Header auf einer Achse),
  `ui5-tag` (Gate-Status, Issues-Count), custom link-cards
  (clickable button area + vertical separator + download icon zone),
  `ui5-icon` (sys-enter-2, document, task, source-code, alert, download).
  Stats cards show icons beside value+label. Gate notes use `→` arrow.
  Deferred issues render description inline (no separate reason line).

Das Layout ist responsive (reine CSS-Media-Queries, Breakpoints bei 700px und 500px —
Details unten im Feature-Stand).

**Betriebsmodi der UI** (automatisch erkannt):
- **MCP-App** (in Claude Desktop): `app.connect()` erfolgreich → State über MCP-Tools
  (`get-status`), Markdown über `get-file`. Fullscreen-Toggle verfügbar.
- **Standalone** (Browser): `app.connect()` schlägt fehl → Fallback auf REST
  (`/api/status`, `/files/...`). Fullscreen-Buttons werden ausgeblendet.
- In beiden Modi: Polling alle 1,5 s.

## Datenfluss (End-to-End)

```
modernize-ui5-app Workflow (läuft in der Ziel-App)
   │  push_status  →  curl POST localhost:3001/mcp  →  MCP-Tool "update-status"
   ▼
~/.ui5-modernization-dashboard/state.json   ← EINZIGE Quelle der Wahrheit
   ▲                                          ▲      (Home-Dir, nicht TMPDIR —
   │ Git-Polling (5 s, nur HTTP-Modus)        │       geteilt über Sandbox-Grenzen)
HTTP-Server :3001                      stdio-Server (Desktop)
   │ /api/status (1,5 s Poll)                 │ get-status (1,5 s Poll)
   ▼                                          ▼
Browser-Dashboard                      MCP-App-Panel in Claude Desktop
```

Beide Oberflächen können gleichzeitig laufen und spiegeln denselben State.
`push_status` ist im Workflow fire-and-forget — ein fehlgeschlagener Push darf
den Modernisierungslauf nie abbrechen.

## Die 6 Phasen (vom Workflow vorgegeben)

1. Mechanical Baseline — Autofix + Test-Starter-Modernisierung
2. Foundation — manifest.json + Component.js
3. Module System & Globals — JS-Globals, Pseudo-Module, Zyklen, Blind Spots
4. Deprecated APIs — deprecated APIs/Themes ersetzen
5. CSP Compliance — Inline-Skripte externalisieren
6. Documentation — Report + Issues schreiben

Nach jeder Phase (außer 6) läuft ein **Verification Gate** (Tests), je nach
gewähltem Modus (full autonomous / half autonomous / manual).

## Was die App heute kann (Feature-Stand)

- **UI5 Web Components** für alle drei Screens (Idle, Running, Completed). Gezielte
  Imports, **kein** `Assets.js`. Bundle-Größe: ~1315 KB inline (Baseline 310 KB).
- **Theme-Bridge**: `sap_horizon` / `sap_horizon_dark` per `registerThemePropertiesLoader`
  registriert; `setTheme` schaltet nach Host-Theme (`light`/`dark`) in `handleHostContext`.
- **Drei Screens** mit automatischem Wechsel nach `status`.
- **Responsive Layout** (reine CSS-Media-Queries):
  - Running-Screen max. Breite 78% / 820px, Stats als 4er-Grid.
  - ≤ 700px: 95% Breite, Preflight als 2-Spalten-Grid, Stats 2×2, Stepper kompakt
    (Gate-„Gate"-Text und Phasen-Dauern ausgeblendet, kleinere Kreise).
  - ≤ 500px: Gate-Knoten ganz ausgeblendet (nur 6 Phasen-Kreise + Connectoren);
    Gate-Status bleibt im Completed-Screen sichtbar.
- **Desktop-Höhen (iframe)**: Completed-Screen füllt in **beiden** Modi die volle
  iframe-Höhe und scrollt intern (Fenster scrollt nie). Fullscreen hat extra
  Bottom-Padding, damit die Chat-Leiste die Link-Buttons nicht verdeckt.
  Running-Screen: die Activity-Commit-Liste ist der einzige scrollende Bereich
  (`max-height`-Cap), der Rest bleibt fix.
- **Live-Timer**, der von `startedAt` hochzählt, bei Inaktivität (>90 s ohne
  Git-Aktivität) pausiert und nie zurückspringt. Gesamt- und Phasen-Timer.
- **Stunden-Format in allen Timern**: `Xh Ym Zs` ab 1 h, sonst `Ym Zs` bzw. `Zs`
  (zentrale `formatElapsed`-Funktion).
- **Stepper** (Custom-Aufbau in `ui5-card`): Phasen- und Gate-Knoten; Farben über
  SAP-Theme-Tokens (`--sapPositiveColor`, `--sapCriticalElementColor`, `--sapNegativeColor`,
  `--sapInformativeColor`). Dauer je Phase farbcodiert. Gate-Dauer bewusst nicht gezeigt.
  Top-Padding 20px; Duration-Labels am unteren Rand via `margin-top: auto`.
- **Gate-Darstellung mit drei Zuständen** in der Completed-Phase-Summary:
  grün ✅ (alle Tests grün), amber ⚠ (passed, nicht alle Tests), rot ❌ (failed);
  plus optionale Erklärzeile (`gateNote`).
- **Gate-Metriken**: `gateDurationSeconds`, `gateTestsPassed/Total`.
- **Git-Aktivität** live (geänderte Dateien, Commits) über Server-Polling.
- **Markdown-Viewer** für Report/Issues (Overlay in Desktop via `get-file`,
  gerenderte Seite im Browser via `/files/:filename`). Noch Custom-UI (kein `ui5-dialog`).
- **Standalone- vs. MCP-App-Modus** mit automatischem Fallback.
- **Stale-Schutz**: ein „running"-State älter als 24 h wird als idle behandelt.

## Bauen & Starten

```bash
npm run build     # vite (UI → dist/) + tsc (Server → dist-server/)
node dist-server/main.js            # HTTP-Server auf :3001 (Browser)
node dist-server/main.js --stdio    # stdio-Server (Claude Desktop)
npm run dev       # watch-Build + tsx-Server (Entwicklung)
npm run bundle    # vite UI + esbuild: Server zu EINER dist-server/main.js (Deps inline, kein node_modules)
npm run deliver   # bundle + Artefakte nach plugins/ui5-modernization/dashboard/ kopieren (nach jeder Änderung ausführen)
```

`dist/` und `dist-server/` sind gitignored — nach einem frischen Checkout muss
erst gebaut werden. UI-Deps (für den Build): `@ui5/webcomponents`,
`@ui5/webcomponents-fiori`, `@ui5/webcomponents-icons`, `@ui5/webcomponents-theming`,
`@ui5/webcomponents-base`. Laufzeit-Deps (für den Server): express, cors, marked, zod,
@modelcontextprotocol/*.

## Integration & Auslieferung

- Der Workflow (`plugins/ui5-modernization/skills/modernize-ui5-app/SKILL.md`)
  startet den Server und pusht den Status.
- **Desktop-Setup** ist im Server als `setup-desktop-dashboard`-MCP-Tool eingebaut
  (nur macOS). Es kopiert Bundle-Artefakte nach `~/Library/Application Support/UI5
  Modernization Dashboard/<profile>/runtime/`, registriert den MCP-Server-Eintrag in
  `claude_desktop_config.json` und öffnet Claude erneut — alles über einen
  launchd-Helper, der auf den User-Quit wartet.
- **Plugin-Auslieferung:** Der MCP-Server wird self-contained über
  `plugins/ui5-modernization/dashboard/` ausgeliefert (`.mcp.json`-Pfad:
  `${CLAUDE_PLUGIN_ROOT}/dashboard/dist-server/main.js`). Nach jeder Änderung:
  `npm run build && node scripts/copy-to-plugin.mjs`.

## Changelog

> Neueste zuerst. Ein Eintrag pro nennenswerter Änderung. Format: `### JJJJ-MM-TT — Titel`,
> darunter kurze Stichpunkte. Bei Code-Änderungen gern den Commit-Hash nennen.

### 2026-11-04 — stop-status, reset-app Tools + Stopped-Screen

- **`stop-status`-Tool:** Markiert den Lauf als `"stopped"` (mit optionalem `reason`), erhält dabei alle Fortschrittsdaten (Phasen, Findings, deferred Issues). Server setzt `stoppedAt`-Timestamp.
- **`reset-app`-Tool:** Setzt die gesamte Modernisierung zurück — verwirft uncommitted Changes auf dem Work-Branch (`git checkout . && git clean -fd`), wechselt auf den Original-Branch zurück, setzt Dashboard auf idle. Behebt den Bug, bei dem modifizierte Dateien beim Branch-Wechsel auf den Original-Branch mitgenommen wurden.
- **Stopped-Screen** im Frontend (vierter Screen neben Idle/Running/Completed): zeigt Stop-Grund, bisherige Phasen und Reset-Button.
- **Fullscreen-Logik** im TS bereit (syncs `availableDisplayModes` aus Host-Context), aber Buttons nicht im HTML — blockiert durch 3P Feature-Gate `513873720` (`epitaxyMcpAppPane`). Kommentar im Code dokumentiert Wiederaktivierung.
- **No-Cache Meta-Tags** in `mcp-app.html`.
- **SKILL.md:** `reset-app`-Tool dokumentiert; Agent darf Reset nie manuell per Git machen.
- Commit `efe2261`.

### 2026-11-03 — Dashboard Rebuild (sauberer Neuaufbau)

- **Anlass:** Aufgeschichtete Änderungen (teils von anderem Agenten) machten das Dashboard instabil. Statt Hinterherfixen: kontrollierter Neuaufbau ab committetem HEAD (b6116bd).
- **State-Pfad** von TMPDIR auf `~/.ui5-modernization-dashboard/state.json` migriert (`state-store.ts`, atomare Writes). Server-verwaltete Zeitstempel (startedAt, phaseStartedAt, completedAt).
- **Tool-Split:** `open-dashboard` (einziges Widget-Tool) + `get-status` (liest nur, kein Widget). Schemas statt passthrough().
- **Desktop-Setup:** `setup-desktop-dashboard`-Tool (macOS, launchd-basiert). Locale-Bug in `processIdentity()` behoben (ps-Ausgabe war locale-abhängig).
- **Frontend:** Kaputte Fullscreen-Erweiterung zurückgenommen; funktionierende Minimal-Form beibehalten. Polling-Idempotenz, vereinfachter Timer (server-owned startedAt), startPolling bei completed-Screen.
- **Delivery:** `copy-to-plugin.mjs` kopiert jetzt auch desktop-setup-Artefakte + package.json.
- **Duplicate-Server-Fix (cf647f8):** Dashboard-Server aus Plugin-`.mcp.json` entfernt. Duplicate Registrierung (Plugin + `claude_desktop_config.json`) erzeugte mehrere Server-PIDs und verhinderte Widget-Rendering. Regel: Dashboard-Server nur in app-config, nie zusätzlich in Plugin-`.mcp.json`.
- **viewId-Entfernung (df8ba6a):** viewId-Teardown-Logik wieder entfernt — war ungetestet, unverifiziert, und nach dem Duplicate-Server-Fix nicht mehr nötig.
- **Counter-Derivation:** Server (`writeState`) und Frontend (`renderDashboard`) leiten `findingsFixed`/`findingsRemaining`/`overallProgress` aus den Phasen-Daten ab, wenn der Agent sie nicht explizit pusht.

### 2026-10-29 — Server self-contained ins Plugin (Delivery-Fix)

- **Problem:** Die Plugin-`.mcp.json` zeigte mit `${CLAUDE_PLUGIN_ROOT}/../../apps/...` aus dem Plugin heraus. Laut Doku verletzt ein `..`-Pfad die Plugin-Containment-Regel (`claude plugin validate`: „Path contains '..'…") → lädt bei echter Marketplace-Installation nicht. Zudem zeigte er auf gitignorte `dist*`-Artefakte, die nach frischem Clone fehlen.
- **Fix (Variante A1):** Server wird per esbuild zu **einer** Datei gebündelt (`npm run bundle`: vite→`dist/mcp-app.html`, esbuild→`dist-server/main.js` mit allen 8 Laufzeit-Deps inline, kein `node_modules` zur Laufzeit). Die gebauten Artefakte werden per `scripts/copy-to-plugin.mjs` (`npm run deliver`) nach `plugins/ui5-modernization/dashboard/` kopiert und dort **committet**. Layout `dashboard/dist-server/main.js` + `dashboard/dist/mcp-app.html` erhält die bestehende `import.meta.url`-relative `../dist/`-Auflösung — **keine** Code-Änderung in `server.ts`/`main.ts`.
- **`.mcp.json`:** Pfad jetzt `${CLAUDE_PLUGIN_ROOT}/dashboard/dist-server/main.js` — self-contained, kein `..`. `claude plugin validate` ist grün; `claude mcp list` zeigt den Server `✔ Connected`.
- **Quelle der Wahrheit bleibt `apps/`**: dort entwickeln + `npm run deliver` nach jeder Server-/UI-Änderung, um die Plugin-Artefakte zu aktualisieren.
- Bundle-Größe: Server `dist-server/main.js` ~2,5 MB (Deps inline), UI `dist/mcp-app.html` ~1,3 MB. Standalone-Start ohne `node_modules` verifiziert.

### 2026-10-29 — Status-Transport auf MCP-Tool vereinheitlicht (desktop-sandbox-tauglich)

- **Hintergrund:** Ein echter Modernisierungslauf in **Claude Code Desktop** scheiterte am Dashboard: die Desktop-Sandbox blockiert Port-Binding (`EPERM` auf :3001) **und** direkte `/tmp`-Schreibzugriffe. Der curl-basierte Push an `localhost:3001/mcp` konnte dort nicht laufen → Widget blieb leer.
- **State-Pfad variabel:** `STATE_FILE` in `server.ts` und `main.ts` von hartcodiert `/tmp/...` auf `path.join(process.env.TMPDIR || "/tmp", "ui5-modernization-state.json")` umgestellt. Der Server schreibt in sein eigenes `$TMPDIR`; da nur der Server-Prozess die Datei anfasst, ist eine `$TMPDIR`-Divergenz zwischen Agent und Server irrelevant.
- **Push über MCP-Tool statt curl:** Der Workflow pusht Status jetzt in **beiden** Hosts über das `update-status`-MCP-Tool (kein HTTP, kein Port, kein curl). Verifiziert, dass `update-status`/`get-status` im Desktop ohne HTTP-Server end-to-end funktionieren.
- **HTTP-Server nur noch CLI:** Der Server auf :3001 wird nur im CLI-Fall gestartet und dient allein der **Browser-Anzeige**, nicht mehr dem Push. Im Desktop: kein Server, kein Port.
- Bundle-Größe unverändert ~1316 KB. Die `:3001/files`-Links im Widget sind bereits an `standaloneMode` gebunden (im Desktop über das `get-file`-Tool) — keine Änderung nötig.

### 2026-10-28 — `install-dashboard`-Skill entfernt, Dashboard-Anzeige auf zwei Wege konsolidiert

- **`install-dashboard`-Skill entfernt.** Er patchte `claude_desktop_config.json`, um den Dashboard-MCP-Server in die GUI-App zu registrieren. Verifiziert: sowohl die CLI als auch Claude Code Desktop laden den Server bereits über die Plugin-`.mcp.json` (`plugins/ui5-modernization/.mcp.json`); in Code Desktop zeigt `/mcp` den Server auch bei geleerter `claude_desktop_config.json`. Der Config-Patch war damit redundant.
- **Zwei konsolidierte Anzeige-Wege** (beide aus derselben Plugin-`.mcp.json`, kein separates Setup): CLI → Dashboard im Browser (`localhost:3001`, Workflow startet den HTTP-Server automatisch); Claude Code Desktop → natives Inline-Panel, alternativ Browser. Beide teilen denselben State-File `/tmp/ui5-modernization-state.json`.
- **Workflow `modernize-ui5-app`:** die „Claude Desktop-Frage" (Schritt B inkl. Config-Detection und `/install-dashboard`-Aufruf) entfällt; nach der Dashboard-Frage (Schritt A) + Server-Start folgt direkt die Verification-Mode-Frage.
- **Hinweis zur früheren „deferred delivery"-Notiz** (unten, Abschnitt „Integration & Auslieferung"): die `.mcp.json`-Auslieferung ist umgesetzt. Verbleibender echter Blocker für fremde Nutzer: `.mcp.json` zeigt auf das gitignored `dist-server/` — nach frischem Clone fehlt der Build. Separat zu lösen.
- **Cowork** bewusst ausgeklammert (kein typischer Entwickler-Host, kein `/mcp`).

### 2026-10-28 — Responsive Layout, Phase-Summary-Alignment, Desktop-Höhen-Fixes

- **Running-Screen:** max. Breite 78% / 820px (vorher 90% ohne Cap), mehr Card-Spacing
  (gap 12px, Stats 10px), höhere Stepper-Card. Die Activity-Commit-Liste ist der einzige
  scrollende Bereich (`max-height`-Cap) — das Fenster scrollt nicht mehr mit.
- **Responsive (CSS-Media-Queries):** ≤ 700px → 95% Breite, Preflight als 2-Spalten-Grid,
  Stats 2×2, Stepper kompakt (Gate-Text + Phasen-Dauern weg, kleinere Kreise). ≤ 500px →
  Gate-Knoten ganz ausgeblendet (nur Phasen-Kreise + Connectoren).
- **Completed Phase-Summary:** Spalten `Commit` und `Duration` getauscht (jetzt
  `# / Phase / Fixed / Files / Commit / Duration`). Duration-Spalte rechtsbündig —
  Phasen-Dauern, Gate-Dauern und der Spalten-Header enden auf einer Achse, mit 28px-Inset
  passend zum Rechtsabstand der übrigen Spalten; Spalte auf 6.5rem verbreitert.
- **Completed Desktop-Höhe:** Inline-Modus füllt jetzt die volle iframe-Höhe (vorher fester
  `max-height: 420px`, der die untere Hälfte leer ließ). Fullscreen: Bottom-Padding auf
  `80px + 3rem` erhöht, damit die Chat-Leiste die Report-/Issues-Link-Buttons nicht verdeckt.
- Bundle-Größe unverändert ~1316 KB (reine Layout-/CSS-Änderungen). Commit `b76acea`.

### 2026-10-22 — Visual finetuning: Completed & Idle Screens

- **Idle screen:** Illustration changed from `Achievement` to `tnt/Tools`; title now includes
  `developer-settings` icon with `--sapLinkColor` accent.
- **Amber color correction:** All `--sapCriticalColor` (#ffdf72 "senfy") replaced with
  `--sapCriticalElementColor` (#f7bf00 stronger amber) across stepper, gates, and preflight.
- **Stepper spacing:** Top padding increased to 20px; duration labels aligned to bottom via
  `margin-top: auto` + `min-height: 80px` on steps.
- **Completed screen:** Background set to `transparent` (fixes dark border). Stats cards now
  show icons (task, document, source-code) beside value+label. Link cards rebuilt as custom
  layout: large clickable button area (opens markdown viewer) + vertical separator + download
  icon area. Phase table columns have explicit widths (Fixed/Files/Duration/Commit pinned right).
  Gate notes now use `→` arrow. Deferred issues render description inline.
- Bundle size: **~1315 KB** (up from ~1261 KB, mainly tnt/Tools illustration + download icon).

### 2026-10-22 — Dashboard/Running-Screen + Stepper auf UI5 Web Components migriert

- Phase 3+4 der Migration (`MIGRATION-UI5-WEBCOMPONENTS.md`): alle verbleibenden Screens
  nutzen jetzt UI5 Web Components. Die gesamte App ist migriert (Idle, Running, Completed).
- **Running-Screen:** Header → `ui5-bar` + `ui5-title` + `ui5-button`; Preflight/Stepper/
  Phase-Info/Stats/Activity → je `ui5-card`; Progress → `ui5-progress-indicator`;
  Status → `ui5-tag` (Farbschema per State); Icons → `ui5-icon` (task, history, trend-up,
  source-code); `ui5-card-header` für Activity.
- **Stepper (Phase 4):** Custom-Aufbau beibehalten (kein `ui5-wizard`/`ui5-timeline` —
  die Gate-Semantik passt nicht), aber alle Farben auf SAP-Theme-Tokens umgestellt
  (`--sapPositiveColor`, `--sapCriticalColor`, `--sapNegativeColor`, `--sapInformativeColor`,
  `--sapGroup_TitleBorderColor`).
- `durationColor()` und Commit-Listen-Farben in `mcp-app.ts` ebenfalls auf Theme-Tokens.
- Bundle-Größe: **~1261 KB** (+55 KB gegenüber Phase 1+2). Commit `d5ff48d`.

### 2026-10-21 — Completed- & Idle-Screen auf UI5 Web Components migriert
- Erste echte Migrationsphase (Plan `MIGRATION-UI5-WEBCOMPONENTS.md`, Phase 1 + Idle):
  Completed- und Idle-Screen nutzen jetzt echte UI5 Web Components
  (`ui5-card`, `ui5-table`, `ui5-tag`, `ui5-illustrated-message`, `ui5-busy-indicator`,
  `ui5-list`/`ui5-li`, `ui5-icon`). Dashboard/Running-Screen inkl. Stepper **unverändert**.
- **🔴 Bundle-Regel umgesetzt:** gezielte Imports, **kein** `Assets.js`. Theme-Registrierung
  korrigiert: der reine CSS-Import registriert das Theme NICHT — stattdessen
  `registerThemePropertiesLoader` für die drei Theme-Pakete (`-theming`, core, `-fiori`) auf
  `sap_horizon_dark`, dann `setTheme`. Details im Migrationsplan.
- Gemessene Bundle-Größe: `dist/mcp-app.html` **~1206 KB** (Baseline 310 KB). Divergenz zur
  Spike-Schätzung dokumentiert und bewusst akzeptiert (s. Migrationsplan).
- Phase-Summary ist jetzt eine echte `ui5-table`; die Zeilen (inkl. der Gate-Detailzeilen)
  werden als direkte `ui5-table-row`-Kinder injiziert — die Header-Row bleibt erhalten. Die
  3-Zustands-Gate-Logik (grün/amber/rot + `gateNote`) ist unverändert.
- Visuell verifiziert im Standalone-Browser (Completed + Idle, Dark-Theme, keine Konsolenfehler).

### 2026-10-21 — Stunden-Timer, Drei-Zustands-Gate, Architektur-Doku
- Alle Timer zeigen jetzt Stunden (`Xh Ym Zs` ab 1 h) über die zentrale
  `formatElapsed`-Funktion — wirkt in Elapsed-, Phasen-, Stepper-, Phase-Summary-
  und Completed-Timern. (Commit `7c0dbb1`)
- Gate-Metriken eingeführt: `gateDurationSeconds`, `gateTestsPassed`,
  `gateTestsTotal`, `gateNote` im Phasen-Schema; der Workflow pusht sie am
  Verification Gate. (Commits `7c0dbb1`, `46e10eb`)
- Gate-Darstellung in der Completed-Phase-Summary mit drei Zuständen:
  grün ✅ (alle Tests grün), amber ⚠ (passed, aber nicht alle Tests), rot ❌ (failed);
  plus optionale, direkt anschließende Erklärzeile aus `gateNote` (ohne Trennlinie).
- Dauer-Spalte verbreitert, damit Phasen >1 h einzeilig rendern.
- `install-dashboard`-Abschlussmeldung konkretisiert (Neustart → neuer Chat →
  nach Status fragen). (Commit `46e10eb`)
- Diese `ARCHITECTURE.md` neu angelegt als dauerhafter Stand-Nachweis.

