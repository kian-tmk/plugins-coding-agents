# UI5 Modernization Dashboard — Architektur & Stand

> Stand: 2026-10-21. Diese Datei hält den Gesamtstand der MCP-App fest: wie die Teile
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

Eine Single-Page-App mit drei Screens, umgeschaltet nach `state.status`:

- **Idle** — Startbildschirm, kein Lauf aktiv.
- **Dashboard (running)** — Stepper (6 Phasen + Gate-Knoten), aktuelle Phase mit
  Fortschrittsbalken, Statuszeile, 4 Stat-Kacheln (fixed/elapsed/progress/commits),
  „Current activity", Git-Aktivität (geänderte Dateien), Commit-Liste pro Phase.
- **Completed** — Zusammenfassung: Gesamt-Stats, Phase-Summary (je Phase eine Zeile
  + ggf. Gate-Zeile), zurückgestellte Issues, Links zu Report/Issues.

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

- **Drei Screens** mit automatischem Wechsel nach `status`.
- **Live-Timer**, der von `startedAt` hochzählt, bei Inaktivität (>90 s ohne
  Git-Aktivität) pausiert und nie zurückspringt. Gesamt- und Phasen-Timer.
- **Stunden-Format in allen Timern**: `Xh Ym Zs` ab 1 h, sonst `Ym Zs` bzw. `Zs`
  (zentrale `formatElapsed`-Funktion — greift überall: Elapsed, Phase, Stepper,
  Phase-Summary, Completed-Subtitle).
- **Stepper** mit Phasen- und Gate-Knoten; Dauer je abgeschlossener Phase farbcodiert
  (grün→amber→rot nach relativer Geschwindigkeit). Gate-Dauer wird im Stepper
  bewusst NICHT gezeigt (Übersichtlichkeit).
- **Gate-Darstellung mit drei Zuständen** in der Completed-Phase-Summary:
  - grün ✅ — passed, alle Tests grün
  - amber ⚠ — passed, aber `gateTestsPassed < gateTestsTotal` (nicht geschönt)
  - rot ❌ — failed
  Plus optionale, eingerückte **Erklärzeile** (`gateNote`), die ohne Trennlinie
  direkt an die Gate-Zeile anschließt (bilden einen Block). Ohne Note: nur Status.
- **Gate-Metriken**: Dauer + Testzahlen (`gateDurationSeconds`, `gateTestsPassed/Total`).
- **Git-Aktivität** live (geänderte Dateien, Commits) über Server-Polling.
- **Markdown-Viewer** für Report/Issues (Overlay in Desktop via `get-file`,
  gerenderte Seite im Browser via `/files/:filename`).
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
erst gebaut werden. Laufzeit-Deps (für den Server): express, cors, marked, zod,
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

