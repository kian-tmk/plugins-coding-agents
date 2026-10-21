# Plan: Migration des Dashboards zu UI5 Web Components

> Status: **Spike durchgeführt (Phase 0 + 1), Ergebnis GO.** Stand 2026-10-21.
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

## ⭐ Spike-Ergebnis (2026-10-21) — GO, mit einer kritischen Regel

Gemessen am Completed-Screen (realistischer Fiori-Nachbau: `ui5-table`, `ui5-tag`-Gates,
`ui5-card`, `ui5-panel`, `ui5-illustrated-message`, `ui5-button`), minified Single-File-Build:

| Variante | Größe | Delta | Faktor |
|---|---|---|---|
| Baseline (Custom-UI heute) | 310 KB | — | 1,0× |
| **UI5-Controls + gezieltes Dark-Theme** | **530 KB** | **+220 KB** | **1,7× → GO** |
| UI5-Controls + volles `Assets.js` | **14.111 KB** | +13.801 KB | 45× → No-Go |

**🔴 KRITISCHE REGEL für die echte Migration: NIEMALS `@ui5/webcomponents*/dist/Assets.js`
importieren.** `Assets.js` registriert *alle* Themes + *alle* i18n-Sprachen, die das
`viteSingleFile`-Plugin dann komplett inline bündelt → 14 MB. Stattdessen **gezielt nur das
benötigte Theme-Parameter-Bundle** importieren:

```ts
import "@ui5/webcomponents/dist/generated/themes/sap_horizon_dark/parameters-bundle.css.js";
import "@ui5/webcomponents-fiori/dist/generated/themes/sap_horizon_dark/parameters-bundle.css.js";
```

Das kostet praktisch **0 KB extra** gegenüber dem eingebauten Default-Theme (die Theme-CSS-
Parameter sind winzig; der Ballast im `Assets.js` ist die i18n/CLDR-Masse). Dark-Mode ist
damit voll drin. i18n/CLDR nur laden, wenn wirklich gebraucht (hier: nein).

Fazit: **+220 KB für die komplette Fiori-UI inkl. Dark-Mode ist vertretbar.** Control-Mapping
war wie erwartet unkritisch. Der Spike-Probe-Code (Fiori-Variante) kann als Referenz-Pattern
für den echten `renderCompleted()`-Umbau dienen (Git-Historie / Commit des Spikes).



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

> **Theming-Strategie geklärt (2026-10-21, aus dem ext-apps-SDK verifiziert):**
> Der MCP-Host (Claude Desktop/claude.ai) liefert zwei unabhängige, **opt-in** Kanäle und
> erzwingt **kein** CSS im iframe:
> - `ctx.theme` = binäres `"light"|"dark"` (robust, immer verlässlich). `applyDocumentTheme`
>   setzt daraus `data-theme` + `color-scheme` auf `<html>`.
> - `ctx.styles.variables` = optionale semantische CSS-Palette (~80 Properties wie
>   `--color-background-primary`); **kann komplett fehlen** → nicht als alleinige Quelle nutzen.
>
> **Entscheidung: binäres `theme` → UI5-`setTheme` als vollständige Lösung.** UI5 bringt mit
> `sap_horizon`/`sap_horizon_dark` ein konsistentes Palettensystem mit; die Host-Variablen
> werden NICHT gebraucht (optionales Fine-Tuning später, Kür). Heute ignoriert das Dashboard
> das Host-Theme faktisch (hartcodierte Dark-Farben in `mcp-app.css`, keine `data-theme`-
> Reaktion) → die Migration macht Light/Dark erstmals korrekt.

1. In `handleHostContext` (**mcp-app.ts:108**) mappen:
   `setTheme(ctx.theme === "dark" ? "sap_horizon_dark" : "sap_horizon")`. Auf
   `onhostcontextchanged` erneut rufen (Live-Wechsel; App hört dort bereits).
   **Beide** Themes gezielt importieren (NICHT `Assets.js`):
   `.../themes/sap_horizon/parameters-bundle.css.js` **und** `.../sap_horizon_dark/...`.
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
