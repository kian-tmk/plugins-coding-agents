# Plan: Migration des Dashboards zu UI5 Web Components

> Status: **Migration abgeschlossen.** Alle Phasen (0–5) erledigt. Stand 2026-10-22.
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
`viteSingleFile`-Plugin dann komplett inline bündelt → 14 MB. Stattdessen **nur das eine
benötigte Theme registrieren** — siehe die unten dokumentierte Korrektur (der reine CSS-Import
genügt NICHT).

Fazit: **+220 KB für die komplette Fiori-UI inkl. Dark-Mode ist vertretbar.** Control-Mapping
war wie erwartet unkritisch. Der Spike-Probe-Code (Fiori-Variante) kann als Referenz-Pattern
für den echten `renderCompleted()`-Umbau dienen (Git-Historie / Commit des Spikes).

## 🔧 Korrektur aus der echten Migration (2026-10-21) — Theme-Registrierung

Beim echten Umbau stellte sich die ursprüngliche Spike-Annahme als **falsch** heraus: Der
bloße Import der `parameters-bundle.css.js` **registriert das Theme nicht** — diese Datei ist
nur ein CSS-String-Export (`export default \`…\``), kein Seiteneffekt. Folge: UI5 meldete
*„non-registered theme sap_horizon_dark - falling back to sap_horizon"* und rendert hell.

`Assets.js` funktionierte im Mockup nur, weil es `registerThemePropertiesLoader` für **alle**
Themes aufruft (genau die 14-MB-Falle). Die richtige, minimale Lösung: **genau ein Theme** für
die **drei** Theme-tragenden Pakete registrieren, mit Loadern, die die direkt importierten
CSS-Bundles zurückgeben:

```ts
import { registerThemePropertiesLoader } from "@ui5/webcomponents-base/dist/asset-registries/Themes.js";
import { setTheme } from "@ui5/webcomponents-base/dist/config/Theme.js";
import darkThemingParams from "@ui5/webcomponents-theming/dist/generated/themes/sap_horizon_dark/parameters-bundle.css.js";
import darkBaseParams    from "@ui5/webcomponents/dist/generated/themes/sap_horizon_dark/parameters-bundle.css.js";
import darkFioriParams   from "@ui5/webcomponents-fiori/dist/generated/themes/sap_horizon_dark/parameters-bundle.css.js";

registerThemePropertiesLoader("@ui5/webcomponents-theming", "sap_horizon_dark", async () => darkThemingParams);
registerThemePropertiesLoader("@ui5/webcomponents",         "sap_horizon_dark", async () => darkBaseParams);
registerThemePropertiesLoader("@ui5/webcomponents-fiori",   "sap_horizon_dark", async () => darkFioriParams);
setTheme("sap_horizon_dark");
```

**Wichtig:** `@ui5/webcomponents-theming` trägt die Basis-`sap*`-Design-Tokens (Hintergrund,
Textfarben) auf `:root` — ohne dieses Paket haben die Controls keine Palette. Die beiden
Komponenten-Pakete tragen ihre Control-Tokens auf `:host`. Alle drei sind nötig.

Kosten: Die drei Dark-CSS-Bundles werden jetzt real inline gebündelt (als Daten statt als
side-effect-only Imports tree-geshakt) → der Build wuchs dadurch auf **~1206 KB**. Immer noch
weit unter der `Assets.js`-Falle (14 MB) und ohne jede i18n/CLDR-Masse.

## 📏 Reale Messung nach echter Migration (2026-10-21) — Completed + Idle

Nach der echten Migration von **Completed + Idle** in der vollständigen App (inkl. `marked`,
MCP-ext-apps-SDK, unverändertem Dashboard/Stepper-Code) misst `dist/mcp-app.html`:

| Stand | Größe | Delta vs. Baseline |
|---|---|---|
| Baseline (vor Migration) | 310 KB | — |
| **Completed + Idle migriert** | **~1206 KB** | **+896 KB (≈ 3,9×)** |
| **Alle Screens migriert (final)** | **~1315 KB** | **+1005 KB (≈ 4,2×)** |

**Divergenz zum Spike:** Der Spike (+220 KB) war ein *isolierter* Completed-Nachbau ohne
`marked`, ohne MCP-SDK, ohne den übrigen Dashboard-Code **und** hatte die Theme-Registrierung
via `Assets.js` gelöst (im Mockup unkritisch, da Browser-only). Die reale, single-file-taugliche
Lösung registriert die drei Dark-CSS-Bundles explizit (s. Korrektur oben) — das ist der Haupt-
Unterschied zur Schätzung. Isoliert kosten `ui5-illustrated-message` + die `Achievement`-
Illustration ~156 KB. **Entscheidung (2026-10-21): akzeptiert** — ~1,2 MB inline wird
mitgenommen. Bei weiteren Phasen die Zahl im Auge behalten; die Illustration ist der erste
Streichkandidat.



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

## Phase 1 — Spike: nur der Completed-Screen (Go/No-Go) — ✅ erledigt (+ Idle)

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

## Phase 3 — Dashboard- & Idle-Screen (Live-Screens) — ✅ erledigt

- Idle-Empty-State → `ui5-illustrated-message` + `ui5-busy-indicator` (in Phase 1 miterledigt).
- Header (beide Screens) → `ui5-bar` + `ui5-title` + `ui5-button`.
- Preflight-Strip → `ui5-card` (Wrapper, innerer Aufbau beibehalten).
- Stats-Grid → 4× `ui5-card` + `ui5-icon` (task, history, trend-up, source-code).
- Progress-Bar → `ui5-progress-indicator`.
- Status-Dot + Text → `ui5-tag` mit `color-scheme` (Running/Testing/Failed/Waiting).
- Stepper → `ui5-card` (Wrapper, Custom-Stepper-Aufbau beibehalten).
- Phase-Info → `ui5-card` (Wrapper).
- Activity-Section → `ui5-card` + `ui5-card-header`.
- Commit-Liste → beibehalten (innerHTML, kein ui5-list — der Aufwand lohnt nicht, die
  Zeilen sind einfache Flex-Rows ohne Interaktion).
- Markdown-Overlay → beibehalten (Custom, kein ui5-dialog — der Dialog wäre hier overkill).
- **Unangetastet:** Live-Timer-Logik und die Polling-Schleife — Zustandslogik, keine UI-Technik.

Commit: `d5ff48d`. Bundle nach Phase 3: **~1261 KB** (+55 KB für Bar + ProgressIndicator + Icons).
Bundle nach Phase 5 (Visual Finetuning): **~1315 KB** (+54 KB, v.a. `tnt/Tools`-Illustration + `download`-Icon).

## Phase 4 — Stepper (Farben auf Theme-Tokens) — ✅ erledigt

Entscheidung: **Option (c)** — Custom-Stepper-Aufbau behalten, Farben auf SAP-Theme-Tokens umgestellt.

- `var(--green)` → `var(--sapPositiveColor)` (completed, gate-passed, connectors)
- `var(--amber)` → `var(--sapCriticalColor)` (testing, gate-running)
- `var(--red)` → `var(--sapNegativeColor)` (failed, gate-failed)
- `var(--blue)` / `var(--blue-light)` → `var(--sapInformativeColor)` (running, active)
- `var(--border)` → `var(--sapGroup_TitleBorderColor)` (pending circles, connectors)
- `durationColor()` in `mcp-app.ts` ebenfalls auf Theme-Tokens umgestellt.

Im selben Commit `d5ff48d` enthalten. Kein zusätzlicher Bundle-Zuwachs (reine CSS-Token-Umbenennung).

## Phase 5 — Visual Finetuning (2026-10-22) — ✅ erledigt

Post-migration visual polish across all three screens:

- **Idle:** Illustration `Achievement` → `tnt/Tools`; `developer-settings` icon added to title (sized via `width`/`height` on host element — `font-size` does not control ui5-icon SVG size).
- **Stepper:** `--sapCriticalColor` (#ffdf72) → `--sapCriticalElementColor` (#f7bf00) for stronger amber. Top padding 20px, duration labels bottom-aligned via `margin-top: auto` in flex column.
- **Completed:** Background `transparent` (fixes dark border vs. body). Stats redesigned with icons beside values (flex row layout). Link cards rebuilt: large button area + vertical separator + dedicated download area (replaces `ui5-li` with `additional-text`). Phase table explicit column widths (`Fixed`/`Files`/`Duration`/`Commit` pinned right). Gate notes use `→` instead of `↳`. Deferred issues: inline description (no separate reason line).
- Bundle: **~1315 KB** (+54 KB, mainly `tnt/Tools` illustration + `download` icon import).

## Querschnitt (galt in JEDER Phase)

- **Zwei Render-Modi immer getestet:** MCP-iframe (`app.connect()` erfolgreich → `body.desktop`)
  und Standalone-Browser (REST-Polling-Fallback). Beide Pfade sind in `mcp-app.ts` fest
  verdrahtet und dürfen nicht brechen.
- **DOM statt innerHTML:** konsequent Knoten erzeugen + Properties setzen; `escapeHtml` fällt
  dort weg, wo Content als `textContent`/Property geht.
- **Nach jeder Phase gebaut + Größe gemessen** — damit der Bundle-Zuwachs nie unbemerkt entgleist.

## Reihenfolge-Logik (warum so)

Baseline (0) → Completed-Spike mit harter Zahl (1) → nur bei grün: Theming-Bridge (2) →
Live-Screens (3) → Stepper zuletzt (4), weil er semantisch am wenigsten sauber auf UI5 abbildet.

## Noch offen (Kür, nicht Pflicht)

- **`:root` Custom-Tokens aufräumen:** `--bg`, `--surface`, `--border` etc. werden noch vom
  Markdown-Overlay und dem Body-Fallback (Standalone-Browser) gebraucht. Könnten langfristig
  durch SAP-Tokens ersetzt werden, wenn das Overlay auf `ui5-dialog` migriert wird.
- **Markdown-Overlay → `ui5-dialog`:** Funktioniert, aber Aufwand/Nutzen-Verhältnis gering.
- **Commit-Liste → `ui5-list`:** Die Zeilen sind einfache Flex-Rows ohne Interaktion —
  ui5-list bringt hier keinen Mehrwert.
