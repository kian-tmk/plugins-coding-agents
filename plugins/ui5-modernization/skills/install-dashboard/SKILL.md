# install-dashboard Skill

Richtet das UI5 Modernization Dashboard als MCP Server in Claude Desktop ein, sodass der Modernisierungsfortschritt direkt als interaktives Panel im Chat erscheint.

Dieser Skill kann jederzeit per `/install-dashboard` aufgerufen werden — auch unabhängig von einer Modernisierungs-Session.

---

## Phase 0: Voraussetzungen prüfen

### Dashboard-Verzeichnis finden

```bash
DASHBOARD_DIR="$(git rev-parse --show-toplevel 2>/dev/null)/apps/ui5-modernization-dashboard"
if [ ! -f "$DASHBOARD_DIR/main.ts" ]; then
  DASHBOARD_DIR="$HOME/plugins-coding-agents/apps/ui5-modernization-dashboard"
fi
if [ ! -f "$DASHBOARD_DIR/main.ts" ]; then
  echo "❌ Dashboard-Verzeichnis nicht gefunden."
  echo "   Erwartet unter: <git-root>/apps/ui5-modernization-dashboard"
  echo "   oder: $HOME/plugins-coding-agents/apps/ui5-modernization-dashboard"
  exit 1
fi
DASHBOARD_SERVER_JS="$DASHBOARD_DIR/dist-server/main.js"
```

### Kompilierten Server prüfen, ggf. bauen

```bash
if [ ! -f "$DASHBOARD_SERVER_JS" ]; then
  echo "⏳ Dashboard wird gebaut (einmalig)..."
  (cd "$DASHBOARD_DIR" && npm run build > /tmp/ui5-dashboard-build.log 2>&1)
  if [ ! -f "$DASHBOARD_SERVER_JS" ]; then
    echo "❌ Dashboard-Build fehlgeschlagen."
    echo "   Log: /tmp/ui5-dashboard-build.log"
    exit 1
  fi
  echo "✅ Build erfolgreich."
fi
```

### Claude Desktop prüfen

```bash
# Find the active Claude Desktop config — prefer deploymentMode=3p if multiple configs exist
CLAUDE_DESKTOP_CONFIG=$(python3 -c "
import json, os

candidates = [
    os.path.expanduser('~/Library/Application Support/Claude-3p/claude_desktop_config.json'),
    os.path.expanduser('~/Library/Application Support/Claude/claude_desktop_config.json'),
]

# Prefer the one with deploymentMode=3p (active 3p install), fall back to first that exists
result = ''
fallback = ''
for path in candidates:
    if os.path.isfile(path):
        try:
            cfg = json.load(open(path))
            if cfg.get('deploymentMode') == '3p':
                result = path
                break
        except:
            pass
        if not fallback:
            fallback = path

print(result or fallback)
" 2>/dev/null)

if [ -z "$CLAUDE_DESKTOP_CONFIG" ]; then
  echo "❌ Keine Claude Desktop Konfigurationsdatei gefunden."
  echo "   Gesucht in: ~/Library/Application Support/Claude-3p/ und ~/Library/Application Support/Claude/"
  echo "   Bitte starte Claude Desktop einmal, damit die Datei erstellt wird."
  exit 1
fi

echo "✅ Config gefunden: $CLAUDE_DESKTOP_CONFIG"
```

### Prüfen ob bereits korrekt eingerichtet

**PFLICHT: Diesen Bash-Befehl ausführen — nicht aus dem Chatverlauf ableiten, nicht aus dem Gedächtnis beantworten.**

```bash
CURRENT_PATH=$(python3 -c "
import json, sys
try:
    cfg = json.load(open(sys.argv[1]))
    servers = cfg.get('mcpServers', {})
    entry = servers.get('ui5-modernization-dashboard', {})
    args = entry.get('args', [])
    print(args[0] if args else 'NOT_SET')
except Exception:
    print('NOT_SET')
" "$CLAUDE_DESKTOP_CONFIG" 2>/dev/null)

echo "CONFIG: $CLAUDE_DESKTOP_CONFIG"
echo "CURRENT_ENTRY: $CURRENT_PATH"
echo "EXPECTED: $DASHBOARD_SERVER_JS"

if [ -n "$CURRENT_PATH" ] && [ "$CURRENT_PATH" != "NOT_SET" ] && [ "$CURRENT_PATH" = "$DASHBOARD_SERVER_JS" ]; then
  echo "STATUS: already_configured"
else
  echo "STATUS: needs_setup"
fi
```

Read the `STATUS:` line from the output above. Only if `STATUS: already_configured`: report "✅ Dashboard ist bereits korrekt eingerichtet" and exit. A missing or empty entry (`NOT_SET`) always means `needs_setup` — never assume already configured without seeing `STATUS: already_configured` in the actual bash output.

---

## Phase 1: Nutzer informieren und bestätigen lassen

Verwende das **`AskUserQuestion` Tool** (niemals eine normale Chat-Nachricht):

**Frage:** `"Das Dashboard wird als MCP Server in Claude Desktop eingerichtet."`

Den tatsächlichen Config-Pfad (`$CLAUDE_DESKTOP_CONFIG`) in der Beschreibung der Einrichten-Option anzeigen — nicht hardcoded, sondern den Wert aus Phase 0.

**Optionen:**
- **Einrichten** — `$CLAUDE_DESKTOP_CONFIG` wird geändert. Claude Desktop muss danach einmal neu gestartet werden. (Empfohlen)
- **Abbrechen** — Keine Änderungen vornehmen.

Bei **Abbrechen**: Ausgabe `"Setup abgebrochen. Du kannst /install-dashboard jederzeit erneut aufrufen."` und beenden.

---

## Phase 2: Config patchen

Nur ausführen wenn der Nutzer **Einrichten** gewählt hat.

```bash
python3 -c "
import json, sys

config_path = sys.argv[1]
server_js = sys.argv[2]

cfg = json.load(open(config_path))
cfg.setdefault('mcpServers', {})['ui5-modernization-dashboard'] = {
    'command': 'node',
    'args': [server_js, '--stdio']
}
json.dump(cfg, open(config_path, 'w'), indent=2)
print('ok')
" "$CLAUDE_DESKTOP_CONFIG" "$DASHBOARD_SERVER_JS"
```

Bei Fehler: Fehlermeldung ausgeben und beenden.

---

## Phase 3: Abschluss

Ausgabe nach erfolgreichem Patch:

```
✅ Claude Desktop wurde konfiguriert!

Server: <DASHBOARD_SERVER_JS>
Config: ~/Library/Application Support/Claude/claude_desktop_config.json

➡ Nächste Schritte:
   1. Claude Desktop jetzt komplett neu starten (Cmd+Q, nicht nur das Fenster schließen) —
      MCP-Server werden nur beim Start geladen.
   2. Claude Desktop öffnen und einen neuen Chat starten.
   3. Nach dem Modernisierungs-Status fragen, z. B.:
         „Wie ist der aktuelle Status meiner UI5-Modernisierung?"
      (Die genaue Formulierung ist egal — jede Frage nach dem Modernisierungs-Status
       öffnet das Dashboard-Panel direkt im Chat.)

Sobald eine Modernisierung läuft, siehst du den Fortschritt dort live.
```

Die konkrete Beispielfrage anpassen ist erlaubt (z. B. „Zeig mir den UI5-Modernisierungsfortschritt") — wichtig ist nur, dass klar wird: **Claude Desktop öffnen → nach dem Modernisierungs-Status fragen**.

---

## Hinweise

- Der Skill ist **idempotent** — wenn der korrekte Eintrag bereits existiert, wird nichts geändert.
- Der Skill ändert **nur** den `mcpServers.ui5-modernization-dashboard` Eintrag — alle anderen Einstellungen in der Config bleiben unberührt.
- Der Browser-Zugriff (`http://localhost:3001`) funktioniert unabhängig von Claude Desktop und benötigt keinen Neustart.
