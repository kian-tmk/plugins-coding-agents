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
| `skills/install-dashboard/SKILL.md` | **neu** | 185 Zeilen |
| `skills/modernize-ui5-app/SKILL.md` | **stark erweitert** | +596 Zeilen (additiv) |
| `skills/modernize-ui5-app/references/documentation-templates.md` | kleine Präzisierung | ±4 Zeilen |

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

## `install-dashboard/SKILL.md` — neu

Richtet das Dashboard als MCP-Server in Claude Desktop ein (patcht
`claude_desktop_config.json`). Aufrufbar jederzeit per `/install-dashboard`. Struktur:
- **Phase 0** — Voraussetzungen: Dashboard-Verzeichnis finden, Server ggf. bauen, Claude-Desktop-Config finden (bevorzugt `deploymentMode=3p`), prüfen ob bereits korrekt eingerichtet (idempotent).
- **Phase 1** — Nutzer per `AskUserQuestion` bestätigen lassen (Einrichten/Abbrechen).
- **Phase 2** — Config patchen (python3, nur den `ui5-modernization-dashboard`-Eintrag, alles andere unberührt).
- **Phase 3** — Abschluss mit konkreter Anleitung (Neustart → neuer Chat → nach Status fragen).

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
