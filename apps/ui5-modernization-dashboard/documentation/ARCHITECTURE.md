# UI5 Modernization Dashboard — Architektur & Stand

> Stand: 2026-11-11. Diese Datei hält den Gesamtstand der MCP-App fest: wie die Teile
> zusammenspielen, welche Daten fließen und was die App heute kann.
>
> **Pflege-Konvention:** Bei jeder nennenswerten Änderung am Dashboard (Datenfluss,
> State-Schema, Screens, Features) zwei Dinge tun: (1) den betroffenen Abschnitt oben
> aktualisieren und (2) einen Eintrag unten im **Changelog** ergänzen (neueste zuerst,
> ISO-Datum, kurz und faktisch). So bleibt der Stand nachvollziehbar, auch über
> Session- und Werkzeuggrenzen hinweg — diese Datei ist das Gedächtnis, nicht der Chat.

## Was die App ist

Ein **Fortschritts-Dashboard für die UI5-Modernisierung**, gebaut als **MCP App**
(`@modelcontextprotocol/ext-apps`). Während der `modernize-ui5-app`-Skill eine
UI5-App modernisiert, pusht er laufend Status-Updates über MCP-Tools. Das Dashboard
rendert diese live — als **natives Inline-Widget in Claude Desktop** oder als
**Seite im Browser** (`http://localhost:3001`).

Die App zeigt **keine** eigene Logik der Modernisierung — sie ist reine Anzeige.
Die einzige Quelle der Wahrheit ist eine State-Datei, die der Workflow beschreibt
und die App liest.

### Drei Plattformen

Das Dashboard läuft auf allen drei Claude-Plattformen:

| Plattform | Wo | Dashboard-Anzeige | Status-Push |
|---|---|---|---|
| **Claude Code CLI** | Terminal | Browser auf `localhost:3001` | `update-status` MCP-Tool |
| **Claude Code Desktop** | Claude Desktop App (3P-Profil), Code-Modus | Natives Inline-Widget (MCP App im iframe) | `update-status` MCP-Tool |
| **Claude Cowork** | Claude Desktop App (3P-Profil), Cowork-Modus | Natives Inline-Widget (MCP App im iframe) | — (nur Anzeige) |

Claude Code Desktop und Cowork laufen beide in der Claude Desktop App und teilen dieselbe `claude_desktop_config.json` unter `~/Library/Application Support/Claude-3p/`. Ein dort registrierter Dashboard-Server ist in beiden Modi verfügbar. Cowork kann das Dashboard rendern und anzeigen, nutzt aber die Modernisierungs-Tools nicht selbst — der Lauf wird immer von Claude Code (CLI oder Desktop) gesteuert. Claude Code CLI nutzt `claude_desktop_config.json` nicht — dort startet der `modernize-ui5-app`-Skill den Server als HTTP-Prozess (`node dist-server/main.js` auf Port 3001), und der Browser zeigt das Dashboard.

### MCP-App-Rendering in Claude Desktop

Die UI ist eine **MCP App** — sie nutzt das `@modelcontextprotocol/ext-apps` SDK:

1. **Server registriert eine UI-Resource** (`registerAppResource`) unter der URI `ui://ui5-modernization/mcp-app.html`. Diese liefert das gebaute Single-File-HTML (alle JS/CSS inline, ~1320 KB).
2. **Das `open-dashboard`-Tool** trägt `_meta: { ui: { resourceUri } }` — das signalisiert dem Host, dass dieses Tool ein Widget öffnet. Kein anderes Tool hat `_meta.ui`.
3. **Claude Desktop rendert das HTML in einem iframe**. Der Host liefert Theme, Fonts und Style-Variablen über den **Host-Context** (`McpUiHostContext`).
4. **Die UI verbindet sich per `app.connect()`** und kommuniziert dann bidirektional mit dem Server:
   - `app.callServerTool()` → ruft MCP-Tools (`get-status`, `reset-app`, etc.)
   - `app.onhostcontextchanged` → Theme-Wechsel, Display-Mode-Updates
   - `app.ontoolresult` → empfängt `update-status`-Ergebnisse (live Updates)
   - `app.requestDisplayMode()` → Fullscreen-Toggle (aktuell blockiert, s.u.)
   - `app.sendSizeChanged()` → bevorzugte Widget-Breite (720px)

**Widget-Rendering-Regeln (Claude Desktop):**
- Der MCP-Server **muss** in `claude_desktop_config.json` registriert sein (app-config). Plugin-`.mcp.json` allein reicht **nicht** für Widget-Rendering.
- Plugin-`.mcp.json` darf den Dashboard-Server **nicht** registrieren — ein doppelter Eintrag (Plugin + app-config) erzeugt mehrere PIDs und bricht Widget-Rendering stumm.
- Alle Dashboard-MCP-Tools laufen über die eine App-Config-Instanz, die auch das Widget rendert.

**Fullscreen** ist im Code bereit (`toggleFullscreen`, `syncFullscreenButtons`), aber die Buttons sind nicht im HTML — blockiert durch 3P Feature-Gate `513873720` (`epitaxyMcpAppPane`). Ohne Gate liefert der Host `availableDisplayModes: ["inline"]`. Kommentar im Code dokumentiert Wiederaktivierung.

**Standalone-Fallback:** Wenn `app.connect()` fehlschlägt (Browser, kein MCP-Host), fällt die UI auf REST-Polling zurück (`/api/status` alle 1,5 s). Markdown-Dateien werden über `/files/:filename` statt `get-file` geladen.

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
| `runId`, `model`, `buildCommand`, `testCommand` | Run-Metadaten |
| `project`, `projectPath`, `ui5Version`, `verificationMode`, `workingTreeStatus` | Preflight-Infos im Kopf |
| `originalBranch`, `workBranch` | Git-Branches für reset-app (Original-Branch des Users, Modernisierungs-Branch) |
| `linterBaseline`, `totalFindings`, `findingsFixed`, `findingsRemaining` | Finding-Zähler |
| `currentPhase`, `currentActivity`, `overallProgress` | aktueller Fortschritt |
| `startedAt`, `phaseStartedAt`, `completedAt`, `stoppedAt`, `stopReason`, `elapsedSeconds` | Zeitanker für die Timer + Stop-Info |
| `mergedAt`, `mergeStatus` | Merge-Status (`"pending"` \| `"merged"` \| `"skipped"` \| `null`); `mergedAt` server-verwaltet |
| `lastOutcome` | server-geschriebene, persistente Bestätigung der letzten Reset/Clear-Aktion (`kind:"reset"\|"merged-cleared"`, Branch-Namen, `at`). Der Idle-Screen liest sie aus dem State, damit die „zurückgesetzt"-Meldung Reload/zweiten Tab überlebt. Ein neuer Lauf verwirft sie |
| `stage` | Früh-Zustand vor der Phasen-Ansicht: `"started"` (Dashboard geöffnet) → `"linting"` (Baseline-Linter läuft). Steuert die Idle-Screens „Modernisierung gestartet"/„Linter läuft". Wird verworfen, sobald die erste `phases`-Liste ankommt |
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

Ein Node-Prozess, der in **zwei Transport-Modi** laufen kann — beide bedienen denselben State. **In beiden Fällen ist der tragende Statuskanal das MCP-Tool `update-status`** (der Workflow pusht darüber, nie über HTTP). Welcher Modus läuft, entscheidet nur das `--stdio`-Startflag:

- **stdio-Modus** (`node dist-server/main.js --stdio`): MCP-Server über stdio, für **Claude Desktop**. Der Host spricht den Server direkt über die MCP-Verbindung an — kein HTTP, kein Port (die Desktop-Sandbox blockiert Port-Binding ohnehin). Kein Git-Polling, daher fehlt die Git-Aktivität im Desktop-Widget, es sei denn, der Workflow pusht sie explizit in den State.
- **HTTP-Modus** (`node dist-server/main.js`, der Zweig ohne `--stdio`): Express auf Port **3001** (überschreibbar via `PORT`-Env). Dieser Modus existiert **allein, um im CLI-Fall die Dashboard-Seite im Browser auszuliefern** — er ist nicht der „Haupt"- oder bevorzugte Weg, sondern die Browser-Variante. Er bietet das MCP-Protokoll zusätzlich über HTTP (`/mcp`) an und macht als Einziger das **Git-Polling** (alle 5 s): liest Commits seit `startedAt` und aktuell geänderte/neue Dateien aus `projectPath` und schreibt sie als `gitActivity` zurück in den State.

> Statusfluss und Transport sind getrennt: Der Status der Modernisierung geht in CLI **und** Desktop über `update-status` (MCP). HTTP liefert im CLI nur die Browser-Oberfläche — der Browser *liest* dann per `/api/status`, aber geschrieben wird nie über HTTP.


**HTTP-Endpunkte** (nur HTTP-Modus):
- `GET /` → liefert `dist/mcp-app.html`
- `GET /api/status` → aktueller State (JSON); startet bei `running` das Git-Polling
- `POST /api/reset` → State auf idle, stoppt Polling
- `POST /api/stop` → Run als gestoppt markieren (mit optionalem `reason` im JSON-Body), Fortschritt bleibt erhalten
- `POST /api/reset-app` → Repo auf Original-Branch zurücksetzen (optional `removeWorkBranch: true` im Body)
- `POST /api/merge-app` → Work-Branch via `git merge --no-ff` in Original-Branch mergen; nur wenn Run completed und alle Gates passed
- `GET /files/:filename` → rendert eine .md-Datei (Report/Issues) als styled HTML-Seite; löst Pfad aus State auf, Fallback auf `modernization-history/`
- `ALL /mcp` → Streamable-HTTP-MCP-Transport (pro Request eine neue `McpServer`-Instanz)

**MCP-Tools** (`server.ts`, in beiden Modi verfügbar):
- `open-dashboard` — Dashboard-Widget öffnen (einziges Tool mit `_meta.ui`); gibt aktuellen State zurück
- `get-status` — aktuellen State lesen OHNE Widget zu öffnen (für Polling und Agent-Status-Checks)
- `update-status` — Partial-State mergen (der Workflow pusht hierüber); Server verwaltet Zeitstempel (`startedAt`, `phaseStartedAt`, `completedAt`, `stoppedAt`)
- `reset-status` — State auf idle
- `stop-status` — Run als gestoppt markieren (`status:"stopped"`), dabei Fortschrittsdaten erhalten (Phasen, Findings, deferred Issues). Für User-Abbruch, nicht für `reset`
- `reset-app` — Gesamten Modernisierungslauf rückgängig machen: verwirft uncommitted Changes auf dem Work-Branch (`git checkout . && git clean -fd`), wechselt zurück auf den Original-Branch, setzt Dashboard auf idle und schreibt ein persistentes `lastOutcome`. Optional: Work-Branch löschen (`removeWorkBranch: true`). Nach einem Merge: erkennt `mergeStatus:"merged"` und setzt nur Dashboard auf idle (kein Branch-Switch nötig). **Worktree-aware:** ist `projectPath` ein Git-Worktree (Desktop „Use worktree"), wird der Worktree entfernt (`git worktree remove`) statt eines Branch-Switches — der Original-Branch lebt bereits im Root-Checkout
- `merge-app` — Work-Branch via `git merge --no-ff` in Original-Branch mergen. Nur verfügbar wenn Run completed und alle Gates passed. Erstellt Merge-Commit mit Zusammenfassung (Findings, Phasen). Setzt `mergeStatus:"merged"` und `mergedAt`. Verweigert bei fehlgeschlagenen Gates oder wenn bereits gemergt. **Worktree-aware:** bei einem Worktree läuft der Merge direkt im Root-Repo (das schon auf dem Original-Branch steht), mit `git merge --abort` als Rollback
- `get-file` — eine .md-Datei per absolutem Pfad lesen (für die Markdown-Anzeige im Desktop)
- `setup-desktop-dashboard` — (nur macOS, nur stdio-Modus, gated durch `enableDesktopSetup`-Flag) MCP-Server-Registrierung in Claude Desktop Config vorbereiten; launchd-Helper wartet auf User-Quit. Optionale `projectPath` + `resumeContext` bereiten einen Fortsetzungs-Chat vor (Deep-Link `claude://code/new`), der den Workflow nach dem Neustart fortsetzt. Rückgabe-Status steuert den Skill: `configured` (schon registriert → **kein** Neustart, direkt weiter), `waiting-for-quit` (Registrierung vorbereitet → User muss ⌘Q drücken, Helper öffnet Claude + Fortsetzungs-Chat neu), oder Fehler (→ ohne Dashboard fortfahren)
- Resource `ui://ui5-modernization/mcp-app.html` — die UI selbst

### 3. Die UI (`src/mcp-app.ts` + `mcp-app.html` + `mcp-app.css`)

Eine Single-Page-App mit drei HTML-Screens, umgeschaltet nach `state.status`:

- **Idle** — genereller Zustands-/Info-Screen auf Basis von `ui5-illustrated-message`. `setIdleMessage` ist ein Varianten-Helper (`neutral`/`success`/`error`/`warning`, Icon + Akzentfarbe, optionaler Action-Button), `renderIdle(state)` wählt nach Priorität: allgemeiner Fehler (`error`), server-nicht-erreichbar (`error`), Reset/Merge-Bestätigung aus `lastOutcome` (`success`, reload-fest), Stale-Run >24h (`warning` + Reset-Button), Früh-Phase „Modernisierung gestartet"/„Linter läuft" (via `stage`, `neutral`) und sonst „keine Modernisierung". Jeder Zustand mit eigener Illustration + Header-Icon. Pausiert-Darstellung vorbereitet (kein Server-Status). Alle Texte Englisch (seit 2026-11-11).
- **Running** — Live-Dashboard: Preflight-Infos, Phasen-Stepper (Custom, mit Gate-Knoten), Finding-Zähler, Live-Timer, aktuelle Aktivität, Git-Commits.
- **Completed / Stopped** — Zusammenfassung: Phasen-Tabelle mit Gate-Ergebnissen, Statistiken, Links zu Report/Issues (Markdown-Viewer), Reset-Button. Bei `stopped`: Stop-Grund statt Erfolgs-Header, Remaining-Findings hervorgehoben. Beide Status nutzen denselben HTML-Screen (`screen-completed`).

Gebaut mit **UI5 Web Components** (`@ui5/webcomponents`, `-fiori`, `-icons`). Gezielte Imports, kein `Assets.js`. Themes (`sap_horizon`/`sap_horizon_dark`) per `registerThemePropertiesLoader`, umgeschaltet nach Host-Context. Responsive Layout (CSS-Media-Queries, Breakpoints 700px/500px).

**Polling:** Alle 1,5 s — per `app.callServerTool("get-status")` im MCP-Modus, per `fetch("/api/status")` im Standalone-Modus. Zusätzlich empfängt die UI im MCP-Modus jeden `update-status`-Aufruf sofort über `app.ontoolresult` (Push, nicht Poll).

**Eager pre-fetch:** Beim Laden holt die UI per `fetch("/api/status")` sofort den State, noch bevor `app.connect()` abgeschlossen ist — so sieht der Nutzer den aktuellen Screen ohne Wartezeit auf den MCP-Handshake.

**Counter-Derivation:** Sowohl Server (`writeState`) als auch Frontend (`renderDashboard`) leiten `findingsFixed`/`findingsRemaining`/`overallProgress` aus den Phasen-Daten ab, falls der Agent sie nicht explizit pusht.

## Datenfluss (End-to-End)

```
modernize-ui5-app Skill (Agent, läuft in der Ziel-App)
   │  MCP-Tool "update-status"  ─────────────────────────┐
   │  (fire-and-forget, kein HTTP, kein curl)             │
   ▼                                                      ▼
                                              server.ts: writeState()
                                              (Timestamps, Counter-Derivation)
                                                      │
                                                      ▼
~/.ui5-modernization-dashboard/state.json   ← EINZIGE Quelle der Wahrheit
   ▲                                          (Home-Dir, nicht TMPDIR —
   │ Git-Polling (5 s, nur HTTP-Modus)         geteilt über Sandbox-Grenzen)
   │
HTTP-Server :3001                      stdio-Server (Desktop, --stdio)
   │ /api/status (1,5 s Poll)                 │ get-status (1,5 s Poll)
   ▼                                          │ + app.ontoolresult (Push bei
Browser-Dashboard                              │   jedem update-status-Aufruf)
(Standalone-Modus)                             ▼
                                        MCP-App-Widget in Claude Desktop
                                        (iframe, Host-Context für Theme)
```

Beide Oberflächen können gleichzeitig laufen und spiegeln denselben State.
Status-Push ist immer fire-and-forget — ein fehlgeschlagener Push darf den
Modernisierungslauf nie abbrechen.

## Die 6 Phasen (vom Workflow vorgegeben)

1. Mechanical Baseline — Autofix + Test-Starter-Modernisierung
2. Foundation — manifest.json + Component.js
3. Module System & Globals — JS-Globals, Pseudo-Module, Zyklen, Blind Spots
4. Deprecated APIs — deprecated APIs/Themes ersetzen
5. CSP Compliance — Inline-Skripte externalisieren
6. Documentation — Report + Issues schreiben

Nach jeder Phase (außer 6) läuft ein **Verification Gate** (Tests), je nach
gewähltem Modus (full autonomous / half autonomous / manual).

## Szenarien

### Modernisierung starten (CLI)

1. User startet `modernize-ui5-app`-Skill in Claude Code CLI.
2. Workflow erstellt Work-Branch, ruft `update-status` mit Preflight-Daten (Projekt, UI5-Version, Baseline-Findings, Branch-Namen).
3. Dashboard-Server startet auf `:3001`, öffnet Browser. Die UI pollt `/api/status` alle 1,5 s.
4. Pro Phase: Workflow ruft Skills, committet, pusht `update-status` mit Phasen-Fortschritt. Dashboard zeigt Live-Timer, Stepper, Finding-Zähler.
5. Nach jeder Phase: Verification Gate (Tests). Ergebnis wird als `gateStatus`/`gateTestsPassed`/`gateTestsTotal` gepusht.
6. Am Ende: `status:"completed"` + `deferredIssues`. Completed-Screen zeigt Phasen-Summary, Report-/Issues-Links.

### Modernisierung starten (Claude Code Desktop)

1. Skill prüft ob Dashboard-Server in `claude_desktop_config.json` registriert ist.
2. Falls nein: `setup-desktop-dashboard`-Tool aufrufen → kopiert Runtime nach `~/Library/Application Support/UI5 Modernization Dashboard/<profile>/runtime/`, registriert MCP-Server in Config, launchd-Helper wartet auf User-Quit und öffnet Claude neu (mit vorbereitetem Fortsetzungs-Chat, wenn `projectPath`/`resumeContext` übergeben wurden). Gibt das Tool `configured` zurück, ist der Server schon registriert → **kein** Neustart, direkt weiter.
3. **Wichtig:** Server muss in `claude_desktop_config.json` stehen (nicht nur in Plugin-`.mcp.json`), sonst rendert der Host kein Widget. Plugin-`.mcp.json` darf den Dashboard-Server **nicht** zusätzlich registrieren (Duplicate = Widget bricht).
4. `open-dashboard` öffnet das Widget. Status-Updates laufen über `update-status` (MCP-Tool, kein HTTP).

### User stoppt den Lauf

1. Agent ruft `stop-status` mit optionalem `reason` → `status:"stopped"`, Fortschritt bleibt erhalten.
2. Dashboard zeigt Stopped-Screen mit bisherigen Phasen und Stop-Grund.
3. Reset-Button im Dashboard oder `reset-app`-Tool: verwirft uncommitted Changes (`git checkout . && git clean -fd`), wechselt auf Original-Branch, Dashboard auf idle.

### User will Reset nach Abschluss

1. `reset-app`-Tool aufrufen (oder Reset-Button im Dashboard).
2. Tool liest `originalBranch`/`workBranch`/`projectPath` aus State, räumt Working Tree auf, wechselt Branch (oder entfernt den Worktree, falls `projectPath` ein Git-Worktree ist).
3. Optional: `removeWorkBranch: true` löscht den Work-Branch.
4. **Nie manuell** per `git checkout`/`git branch -D` — das lässt modifizierte Dateien auf dem Ziel-Branch liegen.
5. Erfolg schreibt `lastOutcome` in den State → der Idle-Screen zeigt eine reload-feste Bestätigung.

### Auto-Merge nach Abschluss

Drei Fälle nach `status:"completed"`:

1. **Clean** (alle Gates passed, 0 deferred, 0 remaining): Agent ruft `merge-app` automatisch → `git merge --no-ff` vom Work-Branch in Original-Branch. Merge-Commit enthält Zusammenfassung. Dashboard zeigt Erfolg, Reset-Button wird zu "Clear dashboard".
2. **Deferred Issues** (Gates OK, aber Review-Items): Kein Auto-Merge. Dashboard zeigt Warn-Hinweis + Merge-Button. User entscheidet nach Review.
3. **Gate failed**: Merge blockiert. Dashboard zeigt Fehler-Hinweis. Reset oder manuelle Behebung nötig.

## Bauen & Starten

```bash
npm run build     # vite (UI → dist/) + tsc (Server → dist-server/)
node dist-server/main.js            # HTTP-Server auf :3001 — nur für die Browser-Anzeige (CLI)
node dist-server/main.js --stdio    # stdio-/MCP-Server (Claude Desktop)
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

### Plugin-Auslieferung

Die Quelle ist `apps/ui5-modernization-dashboard/`. Der Server wird per esbuild zu **einer** Datei gebündelt (`dist-server/main.js`, ~2,5 MB, alle Deps inline). Die UI wird per Vite zu einer Single-File-HTML gebündelt (`dist/mcp-app.html`, ~1320 KB, JS+CSS inline). Beides wird per `npm run deliver` nach `plugins/ui5-modernization/dashboard/` kopiert und dort committet.

```
plugins/ui5-modernization/
├── .mcp.json                    # NUR chrome-devtools, NICHT dashboard
├── dashboard/
│   ├── dist-server/main.js      # Gebündelter Server (self-contained, kein node_modules)
│   ├── dist/mcp-app.html        # Gebündelte UI
│   ├── desktop-setup.mjs        # Desktop-Registrierungshelper
│   ├── desktop-setup-worker.mjs # launchd-Worker
│   └── package.json
└── skills/
    └── modernize-ui5-app/SKILL.md
```

**Wichtig:** Die Plugin-`.mcp.json` registriert **nur** `chrome-devtools`, **nicht** den Dashboard-Server. Der Dashboard-Server läuft in der CLI als HTTP-Prozess (vom Skill gestartet, für die Browser-Anzeige) und im Desktop als stdio-Instanz (registriert in `claude_desktop_config.json`). In beiden Fällen pusht der Workflow den Status über das `update-status`-MCP-Tool, nicht über HTTP.

### Server-Instanz im Desktop

Im Desktop gibt es **eine** Instanz des Dashboard-Servers: die **App-Config-Instanz** namens `ui5-modernization-dashboard` (stdio, `…/runtime/dist-server/main.js --stdio`), registriert in `claude_desktop_config.json` durch `setup-desktop-dashboard`. Nur diese Instanz kann Widgets rendern. (Der Host startet sie als Prozess-Paar — Node-Prozess + `disclaimer`-Wrapper —, das ist **eine** logische Instanz, nicht zwei.)

Das Plugin (`.mcp.json`) registriert **nur** `chrome-devtools`, **nicht** den Dashboard-Server; auch `plugin.json` lädt keinen MCP-Server (nur `skills`). Die Dashboard-MCP-Tools (`open-dashboard`, `update-status` etc.) werden ausschließlich von der App-Config-Instanz bereitgestellt.

**Achtung:** Wenn `.mcp.json` den Dashboard-Server **zusätzlich** registrieren würde, entstünden zwei Server-PIDs, und das Widget-Rendering bricht stumm. Deshalb steht der Dashboard-Server **nie** in `.mcp.json`.

> **Verwaiste Alt-Einträge:** In einer über längere Zeit gewachsenen `claude_desktop_config.json` kann zusätzlich ein veralteter HTTP-Eintrag auftauchen (z.B. `ui5-modernization` mit `url: http://localhost:3001/mcp`) — ein Relikt aus der abgeschafften curl-an-`:3001/mcp`-Ära (siehe Changelog 2026-10-29). Er wird von keinem aktuellen Setup-Code geschrieben und gehört nicht zur Soll-Architektur. Maßgeblich ist allein der stdio-Eintrag `ui5-modernization-dashboard`; ein solcher HTTP-Alt-Eintrag kann entfernt werden.

### Desktop-Setup

Das `setup-desktop-dashboard`-Tool (nur macOS, gated durch `enableDesktopSetup`-Flag):

1. Kopiert Bundle-Artefakte nach `~/Library/Application Support/UI5 Modernization Dashboard/<profile>/runtime/`
2. Registriert den MCP-Server-Eintrag in `claude_desktop_config.json`
3. Ein launchd-Helper wartet auf User-Quit und öffnet Claude neu

### Skill-Integration

Der `modernize-ui5-app`-Skill (`SKILL.md`) orchestriert den gesamten Ablauf:
- Startet den HTTP-Server (CLI) oder prüft Desktop-Registrierung
- Pusht Status über `update-status` (MCP-Tool, kein HTTP/curl)
- Nutzt `stop-status` bei User-Abbruch (erhält Fortschritt)
- Nutzt `reset-app` bei Reset (nie manueller Git-Reset)
- Nutzt `merge-app` bei Clean-Run (Auto-Merge); bei Deferred Issues entscheidet der User über das Dashboard
- Dokumentiert alle Tools und wann sie aufzurufen sind

## Changelog

> Neueste zuerst. Ein Eintrag pro nennenswerter Änderung. Format: `### JJJJ-MM-TT — Titel`,
> darunter kurze Stichpunkte. Bei Code-Änderungen gern den Commit-Hash nennen.

### 2026-11-11 — Komplette Sprach-Umstellung auf Englisch

- **Alle nutzer-sichtbaren Strings der MCP-App und des Skills sind jetzt Englisch** (Commit `dbb4777`): Idle-Screen-Titel/-Beschreibungen aller Zustände, Inline-Confirm-Dialoge inkl. „Cancel"-Button, Verbindungs-/Fehlermeldungen, der Default-Stop-Grund, das Datums-Locale (`de-DE` → `en-US`), die `desktop-setup`-Meldungen samt Fortsetzungs-Chat-Prompt, sowie im Skill die `AskUserQuestion`-Fragen/-Optionen (`Ja`/`Nein` → `Yes`/`No` samt aller nachgelagerten Code-Referenzen), `echo`-Ausgaben und die Status-Strings in den `push_status`-Beispielen.
- **Auch Code-Kommentare und Testdaten übersetzt.** Das einzelne `ä` im `desktop-setup`-Test-Pfad bleibt bewusst als Nicht-ASCII-Encoding-Testfall.
- **Nicht angefasst:** die deutschen Zod-Locale-Strings im Server-Bundle sind toter Code (Zod bündelt alle Sprachen; zur Laufzeit ist immer Englisch aktiv, da keine Locale registriert wird) und diese Dokumentation (bewusste Ausnahme — bleibt Deutsch).

### 2026-11-11 — Früh-Zustände (`stage`) + Reload-/Tab-robustes Rendern

- **Explizites `stage`-Feld (`"started"`/`"linting"`)** (Commit `b6572b1`): Der Skill pusht `stage:"started"` zusammen mit `open-dashboard` (vor dem Linter) und `stage:"linting"` direkt vor der Baseline — so kann das Dashboard „Modernisierung gestartet" eindeutig von „Linter läuft" unterscheiden, statt aus `currentActivity` zu raten. Der Server verwirft `stage`, sobald die erste `phases`-Liste ankommt.
- **Alle Init-/Pre-Fetch-Pfade laufen über `applyState`:** Ein Reload während der Früh-Phase landet nicht mehr auf einem leeren Running-Screen, sondern wählt den korrekten Früh-Screen.
- **Completed-Transition abbrechbar:** Ein neuer Lauf überschreibt den alten Completed-Screen nicht mehr durch einen hängenden 1,5-s-Timer.
- **Idle-Flash entfernt:** Der „started"-State wird gepusht, bevor die Ansicht geöffnet wird (Reihenfolge im Skill umgestellt).
- **Tests:** neuer stage-Lifecycle-Test. 10/10 grün.

### 2026-11-10 — Idle-Screen-Upgrade, worktree-aware reset/merge, Schema-Diagnose

- **Idle-Screen als genereller Zustands-/Info-Screen (abgeschlossen):** `setIdleMessage` zu einem Varianten-Helper ausgebaut (`neutral`/`success`/`error`/`warning`, Icon + Akzentfarbe via `idle-<variant>`-Klassen, optionaler Action-Button). Neue `renderIdle(state)`-Funktion mit Prioritätslogik deckt alle Zustände ab: „keine Modernisierung" (idle), „Modernisierung gestartet"/„Linter läuft" (Früh-Phase), Stale-Run (>24h, mit Reset-Button), Server-nicht-erreichbar, allgemeiner Fehler und Reset/Merge-Bestätigung. Jeder Zustand mit eigener Illustration + Header-Icon. Pausiert-Darstellung vorbereitet (noch kein Server-Status). Browser-Pfad verifiziert.
- **Reload-feste Reset-Bestätigung (`lastOutcome`):** Der Server schreibt nach Reset/Clear `status:"idle"` **plus** ein persistentes `lastOutcome` (`kind:"reset"|"merged-cleared"`, Branch-Namen, Zeitstempel) ins State-Schema. Der Idle-Screen liest das aus dem State statt aus einem client-lokalen Flag — die „App zurückgesetzt"-Meldung überlebt jetzt Reload und zweiten Tab. Ein neuer Lauf (`isNewRun`) verwirft `lastOutcome` automatisch.
- **Worktree-aware `reset-app`/`merge-app`:** Neuer Helper `getWorktreeRoot()` erkennt, ob `projectPath` ein Git-Worktree ist (Desktop „Use worktree"). Reset entfernt dann den Worktree (`git worktree remove`) statt Branch-Wechsel; Merge läuft direkt im Root-Repo (das schon auf dem Original-Branch steht) mit `merge --abort` als Rollback. Normale Checkouts unverändert.
- **Poll-Idempotenz für Reset/Merge-Buttons:** `renderResetButton`/`renderMergeStatus` überspringen das `innerHTML`-Neuschreiben, wenn sich die Render-Signatur (`data-sig`) nicht geändert hat. Verhindert, dass der 1,5-s-Poll den Button unter einem Klick austauscht. Fehlerpfade re-rendern mit `force`.
- **`update-status`-Schema diagnostisch (`superRefine`):** Die „Supply at least one writable field"-Ablehnung listet jetzt empfangene Keys, unbekannte Keys und Korrekturvorschläge (z.B. `phase → phases`, `current_phase → currentPhase`) und erkennt Wrapper-Payloads (`{arguments:{…}}`). Hintergrund: schwächere Modelle trafen Feldnamen/Struktur unzuverlässig und drehten ohne Hinweis Rückversuch-Schleifen; das JSON-Schema des Tools bleibt unverändert.
- **Tests:** reset-app-Tests um `lastOutcome`-Assertions erweitert (reset + merged-cleared). 9/9 grün.
- Commit `d988576`.

### 2026-11-06 — Desktop-Sandbox: tote Buttons + fehlendes Polling

- **Reset/Merge-Buttons tot in Desktop-Sandbox (`39bc1a7`):** `window.confirm`/`alert` sind im sandboxed Desktop-MCP-App-iframe blockiert (liefern `false` ohne Dialog) — die destruktiven Buttons wirkten dadurch funktionslos. Ersetzt durch eine Inline-Confirm-Zeile (`confirmInline`): Button wird gegen „<Frage> [Bestätigen] [Abbrechen]" getauscht, Feedback läuft über die Action-Status-Zeile.
- **Widget pollte nie nach Connect (`0d6f5b6`):** Nach erfolgreichem `app.connect()` wurde das Polling im Desktop-Fall nicht gestartet, wenn der erste `get-status` einen idle/unbekannten State lieferte — spätere Pushes erschienen nie. Jetzt startet Polling in allen Zweigen.
- **Artefakt-Rebuilds** (`689920a`, `edec2ff`) mit passender Build-ID.

### 2026-11-05 — merge-app Tool + Auto-Merge

- **`merge-app`-Tool:** Mergt den Work-Branch via `git merge --no-ff` in den Original-Branch. Validiert Preconditions (Status completed, alle Gates passed, noch nicht gemergt). Merge-Commit enthält Zusammenfassung (Findings, Phasen). Setzt `mergeStatus:"merged"` und `mergedAt`.
- **Drei Merge-Fälle:** Clean-Run → Auto-Merge durch Agent; Deferred Issues → User entscheidet (Merge-Button im Dashboard); Gate failed → blockiert.
- **State-Felder:** `mergedAt` (server-verwaltet) und `mergeStatus` (`"pending"` | `"merged"` | `"skipped"` | `null`) in State-Schema.
- **Frontend:** Merge-Section im Completed-Screen — Erfolgs-Meldung, Warn-Hinweis oder Blockiert-Meldung je nach Fall. Merge-Button mit Confirmation bei Deferred Issues. Reset-Button nach Merge zeigt "Clear dashboard".
- **REST:** `POST /api/merge-app` Endpunkt im HTTP-Modus.
- **`reset-app` erweitert:** Erkennt Post-Merge-State (`mergeStatus:"merged"` auf Original-Branch) und setzt nur Dashboard auf idle.
- **SKILL.md:** Post-Completion Merge-Anweisungen, neuer Call-Site für `merge-app`.
- **Tests:** 4 neue Tests — Merge-Erfolg, Gate-Verweigerung, Doppel-Merge-Verweigerung, Reset nach Merge.

### 2026-11-04 — stop-status, reset-app Tools + Stopped-Screen

- **`stop-status`-Tool:** Markiert den Lauf als `"stopped"` (mit optionalem `reason`), erhält dabei alle Fortschrittsdaten (Phasen, Findings, deferred Issues). Server setzt `stoppedAt`-Timestamp.
- **`reset-app`-Tool:** Setzt die gesamte Modernisierung zurück — verwirft uncommitted Changes auf dem Work-Branch (`git checkout . && git clean -fd`), wechselt auf den Original-Branch zurück, setzt Dashboard auf idle. Behebt den Bug, bei dem modifizierte Dateien beim Branch-Wechsel auf den Original-Branch mitgenommen wurden.
- **Stopped-Variante** im Frontend: Completed-Screen zeigt bei `status:"stopped"` den Stop-Grund, bisherige Phasen und Reset-Button statt Erfolgs-Header.
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
- **Cowork** nutzt dieselbe `claude_desktop_config.json` wie Code Desktop — Dashboard-Widget ist dort ebenfalls verfügbar.

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

