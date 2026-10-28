# UI5 Modernization Dashboard — Architektur & Stand

> Stand: 2026-10-22. Diese Datei hält den Gesamtstand der MCP-App fest: wie die Teile
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
├── mcp-app.html            # UI-Grundgerüst (Screens, statische IDs)
├── src/
│   ├── mcp-app.ts          # UI-Logik: State lesen, rendern, Live-Timer, Polling
│   └── mcp-app.css         # Styling
├── dist/                   # BUILD-OUTPUT (gitignored): gebündelte mcp-app.html (alles inline)
├── dist-server/            # BUILD-OUTPUT (gitignored): kompilierte main.js + server.js
├── vite.config.ts          # baut src/* + mcp-app.html → dist/mcp-app.html (single file)
├── tsconfig.server.json    # kompiliert main.ts + server.ts → dist-server/
└── modernization-history/  # Beispiel-Reports aus früheren Läufen (Referenz/Fixtures)
```

## Die drei beweglichen Teile

### 1. Der State (einzige Quelle der Wahrheit)

Eine JSON-Datei unter **`/tmp/ui5-modernization-state.json`**. Alles, was das
Dashboard zeigt, steht hier drin. Lesen/Schreiben passiert in `server.ts`
(`readState`/`writeState`) und `main.ts` (Git-Polling).

Wichtigste Felder (TypeScript-Schema: `ModernizationState` in `src/mcp-app.ts`):

| Feld | Bedeutung |
|---|---|
| `status` | `"idle"` \| `"running"` \| `"completed"` — steuert, welcher Screen gezeigt wird |
| `project`, `projectPath`, `ui5Version`, `verificationMode`, `workingTreeStatus` | Preflight-Infos im Kopf |
| `linterBaseline`, `totalFindings`, `findingsFixed`, `findingsRemaining` | Finding-Zähler |
| `currentPhase`, `currentActivity`, `overallProgress` | aktueller Fortschritt |
| `startedAt`, `phaseStartedAt`, `completedAt`, `elapsedSeconds` | Zeitanker für die Timer |
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
- `get-status` — aktuellen State zurückgeben (öffnet das Panel)
- `update-status` — Partial-State mergen (der Workflow pusht hierüber)
- `reset-status` — State auf idle
- `get-file` — eine .md-Datei per absolutem Pfad lesen (für die Markdown-Anzeige im Desktop)
- Resource `ui://ui5-modernization/mcp-app.html` — die UI selbst

### 3. Die UI (`src/mcp-app.ts` + `mcp-app.html` + `mcp-app.css`)

Eine Single-Page-App mit drei Screens, umgeschaltet nach `state.status`.
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
/tmp/ui5-modernization-state.json   ← EINZIGE Quelle der Wahrheit
   ▲                                          ▲
   │ Git-Polling (5 s, nur HTTP-Modus)        │ liest/merged
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
```

`dist/` und `dist-server/` sind gitignored — nach einem frischen Checkout muss
erst gebaut werden. UI-Deps (für den Build): `@ui5/webcomponents`,
`@ui5/webcomponents-fiori`, `@ui5/webcomponents-icons`, `@ui5/webcomponents-theming`,
`@ui5/webcomponents-base`. Laufzeit-Deps (für den Server): express, cors, marked, zod,
@modelcontextprotocol/*.

## Integration & Auslieferung

- Der Workflow (`plugins/ui5-modernization/skills/modernize-ui5-app/SKILL.md`)
  startet den Server und pusht den Status. Der `install-dashboard`-Skill richtet
  das Dashboard als MCP-Server in Claude Desktop ein (patcht heute
  `claude_desktop_config.json`).
- **Offener Punkt (bewusst verschoben):** Auslieferung des MCP-Servers über das
  Plugin selbst (`.mcp.json`) statt Config-Patch — relevant erst für fremde Nutzer
  ohne geklontes Repo, vor der Veröffentlichung. Details siehe Memory
  `dashboard-mcp-plugin-delivery`.

## Changelog

> Neueste zuerst. Ein Eintrag pro nennenswerter Änderung. Format: `### JJJJ-MM-TT — Titel`,
> darunter kurze Stichpunkte. Bei Code-Änderungen gern den Commit-Hash nennen.

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

