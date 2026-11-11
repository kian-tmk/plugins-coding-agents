# UI5 Modernization Plugin — Änderungen gegenüber `main`

> Stand: 2026-10-21. Diese Datei hält fest, was am **Plugin** (`plugins/ui5-modernization/`)
> gegenüber `origin/main` verändert wurde — getrennt von der Dashboard-App (die ist in
> `apps/ui5-modernization-dashboard/ARCHITECTURE.md` dokumentiert).
>
> **Pflege-Konvention:** Bei jeder nennenswerten Plugin-Änderung einen Eintrag im
> **Changelog** unten ergänzen (neueste zuerst, ISO-Datum, kurz und faktisch, gern mit
> Commit-Hash). Diese Datei ist das Gedächtnis über Sessions hinweg, nicht der Chat.

## Überblick

Die Plugin-Arbeit auf dem Branch `add-marketplace-config` dreht sich fast ausschließlich
um **Workflow-Orchestrierung + Live-Dashboard-Anbindung**. Der Plugin-Kern bleibt
unberührt: `plugin.json` und die einzelnen Fix-Skills (fix-js-globals, fix-manifest-json
usw.) wurden **nicht** angefasst. Alle Änderungen sind **additiv** — es wurde keine
Phasen-Logik und kein Skill-Mapping entfernt.

### Geänderte Dateien (vs. `origin/main`)

| Datei | Art | Umfang |
|---|---|---|
| `skills/modernize-ui5-app/SKILL.md` | **stark erweitert** | +596 Zeilen (additiv) |
| `skills/modernize-ui5-app/references/documentation-templates.md` | kleine Präzisierung | ±4 Zeilen |
| `dashboard/` | **Delivery-Artefakte** | gebündelte Server+UI+Desktop-Setup |

### Commits

- `99ce2ff` feat(modernize-ui5-app): add dashboard integration push_status calls
- `58a5b52` feat(ui5-modernization): add install-dashboard skill, update dashboard integration
- `46e10eb` feat(ui5-modernization): push gate duration and test counts, clearer install guidance

---

## `modernize-ui5-app/SKILL.md` — was dazugekommen ist

Dies ist der Orchestrator des End-to-End-Modernisierungs-Workflows. Die Änderungen
schichten ein **Live-Reporting-System** auf den bestehenden Ablauf.

### A. Dashboard-Integration (Phase-0-Setup)
Neuer Block „## Dashboard Integration" — **optional und nicht-blockierend**: wird es
abgelehnt oder ist es nicht verfügbar, läuft der Workflow normal weiter.
- **Zweistufiger `AskUserQuestion`-Flow (deutsch):**
  - **Schritt A** — „Möchtest du das Dashboard … angezeigt bekommen?" (Ja → Server starten; Nein → `DASHBOARD=false`, alles überspringen).
  - **Schritt B** (erst wenn Server läuft) — „Auch in Claude Desktop einrichten?"; „Ja" ruft die `install-dashboard`-Skill auf.
  - Explizite Reihenfolge-Regeln + „common mistakes"-Liste (die drei Fragen nicht bündeln; Schritt B nicht vor dem Serverstart; danach immer die Verifizierungsmodus-Frage).
- **Config-State-Erkennung:** Bash/python3-Block ermittelt die aktive Claude-Desktop-Config (bevorzugt `deploymentMode=3p`, erkennt `Claude.app`/`Claude-3p.app`) und gibt eine `STATUS:`-Zeile aus (`already_configured`/`needs_setup`). Der Agent muss den echten Dateizustand lesen, nicht aus dem Chatverlauf schließen.
- **4-Schritt-Server-Lifecycle:** (1) Dashboard-Verzeichnis auflösen (git-root, dann `$HOME/plugins-coding-agents/apps/ui5-modernization-dashboard` als Fallback); (2) bauen falls `dist-server/main.js` fehlt; (3) Server auf `localhost:3001` starten (Health-Check `/api/status`, überspringen wenn schon läuft); (4) `reset-status` + Browser öffnen. Jeder Fehlerpfad setzt `DASHBOARD=false` und läuft weiter.

### B. `push_status`-Mechanismus + Timer
- Neue Bash-Helfer `START_TS`, `elapsed_seconds()`, `push_status()`.
- `push_status` POSTet an `http://localhost:3001/mcp` als JSON-RPC `tools/call` auf das `update-status`-Tool und spritzt `elapsedSeconds` via python3 ein.
- **Fire-and-forget by design:** „A failed call must never abort the run." Abgesichert mit `[ "$DASHBOARD" = "true" ] || return 0`.
- Eine **Call-Sites-Tabelle** ordnet jedem Lifecycle-Moment (Baseline, Phasenstart, jeder Sub-Agent-Launch/Return, nach Autofix/Linter-Rerun, Phasenende, Lauf-Ende) die zu pushenden Felder zu; Regel: `currentActivity` bei jedem Task-Wechsel pushen.

### C. Phasen-Objekt-Schema (neu, strikt)
- „Required phase object schema" mit exakten Feldnamen — Warnung: das Dashboard „will break on `phase`/`title`" (muss `id`/`name` sein).
- Felder: `id`, `name`, `description`, `status`, `gateStatus`, `skills[]`, `findingsBefore/After`, `filesChanged`, `commit`, `commitMessage`, `durationSeconds` + Gate-Felder `gateDurationSeconds`, `gateTestsPassed`, `gateTestsTotal`, `gateNote`.
- Regel: beim Update alle Felder mittragen. „Critical"-Hinweis: nur Top-Level-Felder pushen ohne das Phasen-Objekt zu aktualisieren → zeigt „0 commits" und veraltete Stats.

### D. Gate-Status / Testzahlen / Timer-Reporting (neu)
- Verification Gate setzt vor den Tests `gateStatus:"running"` (mit `GATE_START`), danach `"passed"`/`"failed"` und füllt `gateDurationSeconds` sowie, wenn verfügbar, `gateTestsPassed`/`gateTestsTotal`.
- **Drei-Zustands-Darstellung:** alle grün → ✅; `passed` aber `gateTestsPassed < gateTestsTotal` → amber ⚠ (durchgewunken, aber Tests übersprungen/toleriert); `failed` → rot ❌. Bei passed<total ist ein einsatziges `gateNote` Pflicht. Rendert z. B. als `Gate: 18/18 Tests passed ✅ 3m 04s`.

### Geändertes Verhalten (nicht nur additiv)
- **Verifizierungsmodus-Auswahl** von statischer Markdown-Tabelle → verpflichtender `AskUserQuestion`-Call („never a plain chat message"). **Manual**-Modus-Beschreibung geändert zu „Keine Tests, nur Linter-Check"; Manual pusht explizit **keinen** `testing`-State.
- **Pro-Phase-Instrumentierung** inline in allen Phasen 1–5: Phasenstart pushen (`status:"running"`, `findingsBefore`, `phaseStartedAt`), nach dem Commit „completed" mit Metriken (`git rev-parse --short HEAD`, `git log -1 --pretty=%s`, `git diff-tree | wc -l`, berechnete `durationSeconds`). Phase 2 mit Extra-Hinweis, immer `"currentPhase":2` mitzusenden.
- **Gate-Ausgang** pusht jetzt Ergebnis (Full autonomous: ✅ completed / ❌ failed+nachfragen; Half autonomous: Ergebnis pushen, dann auf Nutzer warten).
- **Commit-Strategie unverändert** — weiter ein Commit pro Phase, gleiche Messages; nur Metrik-Erhebung drumherum ergänzt.

### Entfernt
- Nur die alte statische Verifizierungsmodus-Tabelle (durch den `AskUserQuestion`-Flow ersetzt). Sonst nichts.

### Gesamtform
- **Jetzt 6 Phasen.** Phase 6 „Documentation" ist als echte Phase formalisiert (`skills:[]`): schreibt `MODERNIZATION-ISSUES.md` + `MODERNIZATION-REPORT.md`, committet `docs: add modernization report and issues`, pusht final `status:"completed"`, `overallProgress:100`, `completedAt`, `deferredIssues`, Report-/Issues-Pfade. Die fünf Fix-Phasen unverändert: (1) Mechanical Baseline, (2) Foundation, (3) Module System & Globals, (4) Deprecated APIs, (5) CSP Compliance.
- **Gate-Flow pro Phase:** `gateStatus:"running"` + `GATE_START` → Gate je Modus (Full autonomous: Test-Sub-Agent, 600000 ms Timeout, ≤3 Retries; Half autonomous: läuft, debuggt aber nie; Manual: keine Tests) → `gateStatus` passed/failed mit Dauer + Testzahlen + optionalem `gateNote`.

## `install-dashboard/SKILL.md` — entfernt

> Der Skill wurde in Commit `1c51f08` entfernt. Desktop-Setup ist jetzt als
> `setup-desktop-dashboard`-MCP-Tool direkt in den Dashboard-Server eingebaut
> (macOS, launchd-basiert). Siehe `apps/ui5-modernization-dashboard/ARCHITECTURE.md`.

## `references/documentation-templates.md` — kleine Präzisierung

Platzhalter im Report-Template konkretisiert: `Model:`/`Generated:` enthalten jetzt
explizite Beispiele (echter Modellname, Datum im `YYYY-MM-DD`-Format) statt generischer
`[MODEL-NAME]`/`[DATE]`.

## Bekannte Punkte / TODO

- **Authoring-Artefakt** in `modernize-ui5-app/SKILL.md`: im Config-Detection-Block
  (um die Zeile mit „Detect config path") steht ein verwaister, verschachtelter
  ```` ```bash ````-Fence-Opener. Kein funktionaler Fehler (es ist Anleitungstext für
  den Agenten, kein ausgeführter Block), aber beim nächsten Edit bereinigen.
- **Dashboard-Auslieferung** über das Plugin (`.mcp.json`) statt Config-Patch — bewusst
  verschoben bis vor die Veröffentlichung. Siehe Memory `dashboard-mcp-plugin-delivery`.

---

## Changelog

> Neueste zuerst. Ein Eintrag pro nennenswerter Plugin-Änderung.
> Format: `### JJJJ-MM-TT — Titel`, darunter kurze Stichpunkte, gern mit Commit-Hash.

### 2026-11-11 — Dashboard: Pause-Button (pausieren & fortsetzen)

- **Pause-Button** im Header neben Stop. Klick pausiert **direkt** (keine Bestätigung); zweistufig wie Stop: Button setzt `pauseRequested:true` (Lauf bleibt `running`, Header zeigt „Pausing…"), der Agent hält am nächsten Checkpoint und ruft `pause-status` → `status:"paused"`.
- **Pause-Screen** (idle, Variante „warning"): zwei Buttons — **Resume** und **Stop run**. Stop ruft das echte `stop-status` (Endscreen). **Resume ist vorerst ein Platzhalter**: ein Widget kann den Agenten nicht selbst neu anwerfen (gleiche IPC-Grenze wie beim Stop), daher zeigt Resume nur den Hinweis „im Chat fortsetzen". Der passende Resume-Skill folgt.
- **Resume-sicheres State-Modell:** `paused → running` gilt in `writeState` als Fortsetzung **desselben** Laufs (nicht neuer Lauf) — `startedAt` und Fortschritt bleiben erhalten.
- Neu: `status:"paused"`, Feld `pauseRequested`, Tools `request-pause` (Button) + `pause-status` (Agent), REST-Backup `POST /api/request-pause`. Tests für request-pause/pause-status + Resume-Fortschrittserhalt (14/14 grün).
- Pause-Zeitpunkt: nächster Checkpoint, auch mitten in der Phase (konsistent mit dem schnellen Stop); der spätere Resume-Skill setzt dort wieder auf.

### 2026-11-11 — Dashboard: Übergangs-Screen nach dem Linter

- **Neuer Early-Stage `analyzed`** zwischen „linting" und dem ersten Phasen-Push. Der Workflow pusht ihn direkt nach dem Baseline-Linter; das Dashboard zeigt „Linter analysis completed — connecting dashboard…" statt ~1-2s relativ leer dazustehen, während die Phasen-JSON gebaut wird. Übergang danach lückenlos auf die Phasen-View (verifiziert).
- state-schema: `stage`-Enum um `"analyzed"` erweitert; SKILL.md Step 1.1 pusht den Stage.
- **Kein leeres Phasen-Gerüst mehr:** Das Dashboard wechselt erst auf die Running-View, wenn eine Phase **tatsächlich läuft** — nicht schon beim ersten (`pending`-only) Phasen-Push. Vorher sah man ~1-2s „Phase — of N" ohne aktive Phase, bis Phase 1 auf `running` kippte. Client (`applyState`/`renderIdle`): hält den Early-Screen, solange keine Phase running/completed/failed ist und kein Fortschritt existiert. Server (`writeState`): nullt `stage` erst bei einer aktiven Phase statt beim bloßen Vorhandensein des Arrays. Test für „stage überlebt pending-only / fällt bei running" ergänzt.

### 2026-11-11 — Stop-Button im Dashboard (graceful stop)

- **Stop-Button** klein oben rechts im Dashboard-Header (laufender Lauf). Klick → Bestätigungs-**Popover** (`ui5-popover`, am Button verankert) mit „Stop"/„Cancel" statt `window.confirm` (im Desktop-iframe blockiert) → Lauf wird am nächsten sicheren Checkpoint beendet.
- **Phase-3/4-Warnung:** In diesen Phasen laufen lange Vordergrund-Batches; das Popover zeigt dort eine **rote Warnung**, dass der Stopp dauern kann und der Lauf ggf. über den Chat beendet werden sollte. In anderen Phasen keine Warnung.
- **Zweistufig:** Button ruft neues `request-stop`-Tool → setzt nur `stopRequested:true`, `status` bleibt `running` (Header zeigt „Stop requested…"). Erst der Agent schaltet via `stop-status` auf `stopped` + Endscreen. Bildet „zum nächstmöglichen Zeitpunkt" ehrlich ab.
- **Signalweg:** Der Agent liest `stopRequested` aus dem Rückgabewert seines nächsten `update-status` und bricht am Checkpoint ab — inkl. `TaskStop` auf laufende Sub-Agenten (harter Stopp). Primär MCP-Tool (CLI + Desktop), REST `POST /api/request-stop` nur Standalone-Backup.
- **Neues Feld** `stopRequested` im State-Schema; ein neuer Lauf löscht ein altes Flag (kein Übertrag).
- **SKILL.md:** neuer Abschnitt „Checking for a stop request" + erweiterte „Stopping early"-Prozedur (TaskStop zuerst, dann `stop-status`).
- **Latenz-Fix (lange Blocker):** Ein externer Prozess kann einen laufenden CLI-Turn NICHT unterbrechen (per Doku bestätigt — Messaging-Socket liefert nur Nachrichten, kein Turn-Interrupt). Darum laufen die langen Blocker (Phase-1 `modernize-test-starter`, alle Verification-Gates) jetzt **vollständig als Hintergrund-Sub-Agent**, während der Orchestrator mit einem **`Monitor`** auf `~/.ui5-modernization-dashboard/state.json` wartet und bei `stopRequested:true` sofort `TaskStop` + `stop-status` ruft (~1-3s statt 30s+). **Wichtig:** Der Orchestrator darf die delegierte Arbeit NICHT parallel selbst im Vordergrund machen — genau das verhinderte im ersten Testlauf das Stoppen (er rief nur EINMAL `get-status` und arbeitete dann ~90s selbst weiter). Kurze Fix-Batches (Phasen 2-5) bleiben Vordergrund.
- Tests für `request-stop` + Stale-Flag-Reset ergänzt (server.test.ts, 12/12 grün). Delivery via `npm run deliver`.

### 2026-11-03 — Dashboard-Rebuild: State, Tool-Split, Desktop-Setup

- **Dashboard-Neuaufbau** ab committetem HEAD (b6116bd). Kaputte Fullscreen-Erweiterung zurückgenommen, funktionierende Minimal-Form beibehalten.
- **State-Pfad** von TMPDIR auf `~/.ui5-modernization-dashboard/state.json` migriert (state-store.ts, atomare Writes).
- **Tool-Split:** `open-dashboard` (einziges Widget-Tool) + `get-status` (liest nur). Schemas statt passthrough().
- **Desktop-Setup:** `setup-desktop-dashboard`-Tool (macOS, launchd). Locale-Bug in processIdentity() behoben.
- **Delivery:** copy-to-plugin.mjs kopiert jetzt auch desktop-setup-Artefakte + package.json.
- **install-dashboard-Skill** bleibt entfernt (war seit 1c51f08 weg); Desktop-Setup ist jetzt ein MCP-Tool im Server.

### 2026-10-29 — Dashboard-Server self-contained ins Plugin (Delivery-Fix)
- **Problem:** `.mcp.json` zeigte mit `${CLAUDE_PLUGIN_ROOT}/../../apps/...` aus dem Plugin heraus — ein `..`-Pfad verletzt die Plugin-Containment-Regel (`claude plugin validate` schlägt fehl) und lädt bei echter Marketplace-Installation nicht; zudem auf gitignorte `dist*`-Artefakte.
- **Fix (A1):** Server wird gebündelt (esbuild, alle Deps inline) und als `plugins/ui5-modernization/dashboard/dist-server/main.js` + `dashboard/dist/mcp-app.html` ins Plugin **committet**. `.mcp.json` zeigt jetzt self-contained auf `${CLAUDE_PLUGIN_ROOT}/dashboard/dist-server/main.js` — kein `..`.
- **Verifiziert:** `claude plugin validate` grün; `claude mcp list` zeigt den Server `✔ Connected`; gebündelte main.js startet standalone ohne `node_modules`.
- Quelle/Build bleibt in `apps/ui5-modernization-dashboard/` (`npm run deliver` aktualisiert die Plugin-Artefakte). Details in `apps/ui5-modernization-dashboard/ARCHITECTURE.md`.

### 2026-10-29 — Status-Push auf MCP-Tool vereinheitlicht (desktop-sandbox-tauglich)
- **Hintergrund:** Ein echter Lauf in Claude Code Desktop scheiterte am Dashboard — die Sandbox blockiert Port-Binding (:3001) und `/tmp`-Schreibzugriffe. Der curl-Push konnte dort nicht laufen.
- **`push_status` auf MCP-Tool umgestellt:** Der Helper bereitet nur noch das Payload vor (reichert `elapsedSeconds` an); der Versand erfolgt in **beiden** Hosts über das `update-status`-MCP-Tool statt curl an `:3001`. `reset-status` ebenso. Kein HTTP/Port für den Push nötig — funktioniert in CLI und Desktop identisch, und robuster als der alte curl-Weg.
- **HTTP-Server nur noch CLI:** Steps 2–4 starten den Server auf :3001 nur im CLI-Fall (für die Browser-Anzeige). Im Desktop: kein Server, kein Port, Widget via `get-status`.
- **Logs/Linter-Output** von `/tmp` auf `${TMPDIR:-/tmp}` umgestellt (Sandbox-tauglich).
- Begleitend in der Dashboard-App: `STATE_FILE` in `server.ts`/`main.ts` auf `$TMPDIR` (siehe `apps/ui5-modernization-dashboard/ARCHITECTURE.md`).

### 2026-10-28 — `install-dashboard`-Skill entfernt, Dashboard-Anzeige auf zwei Wege konsolidiert
- **`skills/install-dashboard/` entfernt.** Der Skill patchte `claude_desktop_config.json`, um den Dashboard-MCP-Server in die GUI-App einzutragen. Verifiziert, dass CLI **und** Claude Code Desktop den Server bereits über die Plugin-`.mcp.json` laden (`/mcp` zeigt ihn in Code Desktop auch bei geleerter Config) — der Config-Patch war redundant.
- **`skills/modernize-ui5-app/SKILL.md`:** die „Claude Desktop-Frage" (Schritt B inkl. Config-Detection-Bash und `/install-dashboard`-Aufruf) entfernt. Ablauf jetzt: Dashboard-Frage (Schritt A) → bei **Ja** Server-Start + Browser → direkt zur Verification-Mode-Frage. Browser-Start (Steps 1–4) und `push_status`-Mechanik unverändert.
- **Zwei konsolidierte Anzeige-Wege** (beide aus derselben Plugin-`.mcp.json`): CLI → Browser (`localhost:3001`); Code Desktop → natives Inline-Panel oder Browser. Cowork bewusst ausgeklammert.
- Die obigen historischen Abschnitte/Zeilen (inkl. der `install-dashboard`-Erwähnungen) bleiben als Entwicklungshistorie erhalten.

### 2026-10-21 — Gate-Metriken + klarere Install-Anleitung
- Verification Gate pusht `gateDurationSeconds`, `gateTestsPassed`, `gateTestsTotal`,
  `gateNote`; Anleitung, `gateNote` bei nicht-vollständig grünen Tests zu setzen. (Commit `46e10eb`)
- `install-dashboard`-Abschlussmeldung konkretisiert. (Commit `46e10eb`)
- Diese `CHANGES.md` neu angelegt.

### (früher auf diesem Branch) — Dashboard-Anbindung des Workflows
- `modernize-ui5-app`: Dashboard-Integration, `push_status`-Mechanismus, striktes
  Phasen-Schema, Gate-Status-Reporting, 6. Phase „Documentation" formalisiert,
  Verifizierungsmodus als `AskUserQuestion`. (Commits `99ce2ff`, `58a5b52`)
- `install-dashboard`-Skill neu. (Commit `58a5b52`)
- `documentation-templates`: Platzhalter präzisiert. (Commit `58a5b52`)
