# Plan: Migration des Dashboards zu UI5 Web Components

> Status: **geplant, noch nicht begonnen.** Stand 2026-10-21.
> Betrifft `apps/ui5-modernization-dashboard/` (die MCP-App). Architektur der App:
> siehe `ARCHITECTURE.md` im selben Verzeichnis.
>
> Leitidee: **inkrementell, messbar, risikoarm.** Nicht alles auf einmal. Jede Phase ist
> einzeln lauffähig und committbar. Die erste echte Code-Phase ist ein Spike, dessen
> einziger Zweck die Go/No-Go-Frage „Bundle-Größe akzeptabel?" ist — bevor Aufwand in die
> schwierigen Teile fließt.
>
> **Der Knackpunkt ist nicht das Control-Mapping** (fast 1:1), **sondern die Bundle-Größe**
> einer inline-gebündelten Single-File-MCP-App und die **Theming-Kollision mit dem Host**
> (Claude Desktop liefert eigenes Theme/Style-Variablen).

## Gemessene Baseline (Phase 0, Teil 1 — bereits erledigt)

- `dist/mcp-app.html` **vor** der Migration: **317.573 Bytes ≈ 310 KB** (single-file, alles
  inline → diese eine Zahl ist die ganze Wahrheit). Gemessen 2026-10-21 mit `npm run build`.
- UI5-Web-Components-Deps sind noch **nicht** installiert.

## Phase 0 — Baseline & Messgerüst (keine UI-Änderung)

1. Gebündelte Größe festhalten: `npm run build`, Größe von `dist/mcp-app.html` notieren.
   (Erledigt: ~310 KB, s. o. — bei Wiederaufnahme neu messen, Code hat sich geändert.)
2. App lokal starten (`npm run dev`) und im Standalone-Browser-Modus (`/api/status`) prüfen,
   dass idle/dashboard/completed rendern — visueller Vorher-Stand für Regressionsvergleich.
3. „Akzeptabel" definieren (z. B. „< X KB inline") als explizites Spike-Abbruchkriterium.
   **Noch zu entscheiden: die harte Zahl X.**

## Phase 1 — Spike: nur der Completed-Screen (Go/No-Go)

Warum Completed zuerst: statisch (abgeschlossene Daten, keine Live-Timer, kein Polling-
Zustand), optisch abgegrenzt, nutzt repräsentativ die wichtigsten Control-Typen. Ideal, um
den Fußabdruck echter UI5-Komponenten zu messen, ohne Theming-Bridge und Stepper-Semantik
lösen zu müssen.

1. Deps installieren: `@ui5/webcomponents @ui5/webcomponents-fiori @ui5/webcomponents-icons`.
2. Nur Completed-Screen-Controls migrieren, **gezielte Imports**:
   - Stats-Zeile → `ui5-card` statt `.completed-stat`
   - Phase-Summary-Tabelle → `ui5-table` (oder `ui5-list`)
   - Deferred-Issues → `ui5-panel` + `ui5-list`
   - Empty-State „keine Issues" → `ui5-illustrated-message`
   - Links zu den MD-Dateien → `ui5-button design="Transparent"` mit Icon
3. `renderCompleted()` umbauen: DOM-Knoten erzeugen + Properties setzen statt innerHTML-Strings.
4. Messen: `npm run build`, Größe gegen Phase-0-Baseline (310 KB).
5. **Entscheidung:** im Rahmen → Phase 2. Zu groß → hier abbrechen, Alternativen bewerten
   (Teilmigration, oder bei Custom-Lösung bleiben). Sinn des Spikes: früh und billig scheitern.

Ergebnis: belastbare Zahl + ein real migrierter Screen als Referenz-Pattern für den Rest.

## Phase 2 — Theming-Bridge (erst wenn Spike grün)

1. UI5-Theme initial setzen und bei Host-Kontext-Änderung mitführen: in `handleHostContext`
   (**mcp-app.ts:108**) Host-Theme auf `setTheme("sap_horizon"|"sap_horizon_dark")` mappen.
2. Compact-Density aktivieren (Klasse auf `#app`), Inline-Höhen nachziehen.
3. Prüfen, welche Custom-Tokens in `mcp-app.css` entfallen können (Farb-Tokens weg,
   Layout-Tokens bleiben), aufräumen.
4. In **beiden** Modi testen: Claude-Desktop-iframe und Standalone-Browser (`body.desktop` vs. nicht).

## Phase 3 — Dashboard- & Idle-Screen (Live-Screens)

- Idle-Empty-State → `ui5-illustrated-message` + `ui5-busy-indicator`.
- Preflight-Strip → `ui5-panel`/`ui5-list`.
- Stats-Grid → `ui5-card` (Pattern aus Phase 1 wiederverwenden).
- Progress-Bar → `ui5-progress-indicator`.
- Status-Dot + Text → `ui5-tag`/`ui5-badge` mit `design` (Running/Testing/Failed).
- Commit-Liste → `ui5-list`/`ui5-table`.
- Header (beide Screens) → `ui5-shellbar` + Fullscreen-`ui5-button`.
- Markdown-Overlay → `ui5-dialog`.
- **Unangetastet:** Live-Timer-Logik (`startLiveTimer`/`pauseLiveTimer`, **mcp-app.ts:612/622**)
  und die Polling-Schleife — das ist Zustandslogik, keine UI-Technik. Nur Darstellung tauschen,
  nicht die Datenpipeline.

## Phase 4 — Stepper (höchstes Risiko, zuletzt)

Der Phase-Stepper mit Gates zwischen den Phasen (idle/running/passed/failed, `buildStepper`
ab **mcp-app.ts:168**) hat keinen exakten UI5-Zwilling.
- Kandidat `ui5-wizard` für die 5 Phasen, aber Wizard modelliert Gates nicht nativ.
- Realistische Optionen: (a) Wizard für Phasen + separates `ui5-tag` für Gate-Status zwischen
  den Steps, (b) eine `ui5-timeline`, oder (c) genau diesen Custom-Baustein behalten und nur
  seine Farben auf UI5-Theme-Variablen umstellen.
- Entscheidung erst, wenn alles andere steht — dann sieht man, wie viel Fremdkörper ein
  Custom-Stepper neben den UI5-Controls noch ist.

## Querschnitt in JEDER Phase

- **Zwei Render-Modi immer testen:** MCP-iframe (`app.connect()` erfolgreich → `body.desktop`)
  und Standalone-Browser (REST-Polling-Fallback). Beide Pfade sind in `mcp-app.ts` fest
  verdrahtet (**ab ca. Zeile 729**) und dürfen nicht brechen.
- **DOM statt innerHTML:** konsequent Knoten erzeugen + Properties setzen; `escapeHtml` fällt
  dort weg, wo Content als `textContent`/Property geht.
- **Nach jeder Phase bauen + Größe messen** — damit der Bundle-Zuwachs nie unbemerkt entgleist.

## Reihenfolge-Logik (warum so)

Erst Baseline (0) → Completed-Spike mit harter Zahl (1) → nur bei grün: Theming-Bridge (2) →
Live-Screens (3) → Stepper zuletzt (4), weil er semantisch am wenigsten sauber auf UI5 abbildet.

> **Code-Referenzen** sind gegen den Stand vom 2026-10-21 geprüft. Bei Wiederaufnahme die
> Zeilennummern kurz gegenchecken (`grep -n "function handleHostContext\|function buildStepper\|function startLiveTimer"`),
> die Datei ändert sich.
