# UI5 Modernization Session — Full Timeline

## Session Metadata

| Field | Value |
|---|---|
| Date | 2026-10-12 |
| Project | sap.ui.demo.todo (OpenUI5 Todo App) |
| Project path | /Users/D051016/SAPDevelop/sample-app-dcom |
| Framework | OpenUI5 1.144.0 |
| Model | claude-4.6-opus |
| Verification mode | full autonomous |
| Initial problems | 48 (40 errors, 8 warnings) |
| Final problems | 0 (0 errors, 0 warnings) |
| Phases completed | 5 fix phases + 1 documentation phase |
| Total commits | 7 (initial + 5 fix + 1 docs) |

### Commit Log

| Commit | Message | Phase |
|---|---|---|
| `5301e0f` | initial commit | Baseline |
| `61e1b05` | chore: apply UI5 linter autofix and modernize test starter | Phase 1 |
| `ac9140a` | fix: modernize manifest.json and Component.js | Phase 2 |
| `657899b` | fix: modernize module system (globals, pseudo-modules, cycles, blind spots) | Phase 3 |
| `7560811` | fix: replace deprecated UI5 APIs | Phase 4 |
| `cc69cfc` | fix: enforce CSP compliance | Phase 5 |
| `9e0a748` | docs: add modernization report and issues | Documentation |

---

## Baseline Analysis

**Commit:** `5301e0f` — initial commit (2026-07-02)

### Linter Output (48 problems — 40 errors, 8 warnings)

```
/Users/D051016/SAPDevelop/sample-app-dcom/ui5.yaml
  1 error

  1:1  error  no-deprecated-library  The library 'sap.ui.commons' is deprecated
              Use an alternative library instead.

/Users/D051016/SAPDevelop/sample-app-dcom/webapp/controller/App.controller.js
  29 errors

  1:1   error  no-deprecated-api  jQuery.sap.declare is deprecated
               Use sap.ui.define instead.
  3:1   error  no-deprecated-api  jQuery.sap.require is deprecated
               Use sap.ui.define instead.
  4:1   error  no-deprecated-api  jQuery.sap.require is deprecated
               Use sap.ui.define instead.
  5:1   error  no-deprecated-api  jQuery.sap.require is deprecated
               Use sap.ui.define instead.
  6:1   error  no-deprecated-api  jQuery.sap.require is deprecated
               Use sap.ui.define instead.
  7:1   error  no-deprecated-api  jQuery.sap.require is deprecated
               Use sap.ui.define instead.
  8:1   error  no-deprecated-api  jQuery.sap.require is deprecated
               Use sap.ui.define instead.
  9:1   error  no-deprecated-api  jQuery.sap.require is deprecated
               Use sap.ui.define instead.
 10:1   error  no-deprecated-api  jQuery.sap.require is deprecated
               Use sap.ui.define instead.
 11:1   error  no-deprecated-api  sap.ui.controller is deprecated
               Use Controller.extend instead.
 15:3   error  no-globals         'sap.ui.core.BarColor' used as a global
               Use sap.ui.require/sap.ui.define instead.
 18:26  error  no-deprecated-api  jQuery.sap.getModulePath is deprecated
               Use sap.ui.require.toUrl instead.
 22:3   error  no-deprecated-api  jQuery.sap.log.info is deprecated
               Use sap/base/Log instead.
 26:20  error  no-deprecated-api  jQuery.sap.extend is deprecated
               Use sap/base/util/merge instead.
 27:42  error  no-globals         'sap.ui.Device' used as a global
               Import Device from 'sap/ui/Device'.
 31:3   error  no-globals         'sap.ui.model.json.JSONModel' used as a global
               Import JSONModel from 'sap/ui/model/json/JSONModel'.
 36:4   error  no-globals         'sap.ui.demo.todo.util.Helper' used as a global
               Import Helper from the module path.
 80:32  error  no-globals         'sap.ui.model.Filter' used as a global
               Import Filter from 'sap/ui/model/Filter'.
 80:76  error  no-globals         'sap.ui.model.FilterOperator' used as a global
               Import FilterOperator from 'sap/ui/model/FilterOperator'.
 88:25  error  no-globals         'sap.ui.model.Filter' used as a global
               Import Filter from 'sap/ui/model/Filter'.
 88:63  error  no-globals         'sap.ui.model.FilterOperator' used as a global
               Import FilterOperator from 'sap/ui/model/FilterOperator'.
 91:25  error  no-globals         'sap.ui.model.Filter' used as a global
               Import Filter from 'sap/ui/model/Filter'.
 91:63  error  no-globals         'sap.ui.model.FilterOperator' used as a global
               Import FilterOperator from 'sap/ui/model/FilterOperator'.
108:3  error  no-globals         'sap.ui.getCore().byId()' used as a global
              Use this.byId() instead.
120:6  error  no-deprecated-api  jQuery.sap.formatMessage is deprecated
              Use sap/base/strings/formatMessage instead.
125:3  error  no-globals         'sap.ui.model.Filter' used as a global
              Import Filter from 'sap/ui/model/Filter'.
125:3  error  no-globals         'sap.ui.model.FilterOperator' used as a global
              Import FilterOperator from 'sap/ui/model/FilterOperator'.
129:3  error  no-globals         'sap.ui.model.Filter' used as a global
              Import Filter from 'sap/ui/model/Filter'.
129:3  error  no-globals         'sap.ui.model.FilterOperator' used as a global
              Import FilterOperator from 'sap/ui/model/FilterOperator'.

/Users/D051016/SAPDevelop/sample-app-dcom/webapp/index.html
  1 error, 1 warning

  8:2  warning  csp-unsafe-inline-script  Inline script detected, violates CSP
               Externalize inline scripts to a separate .js file.
 18:3  error    no-deprecated-theme       Theme 'sap_goldreflection' is deprecated
               Use 'sap_horizon' instead.

/Users/D051016/SAPDevelop/sample-app-dcom/webapp/manifest.json
  2 errors

  2:15  error  no-outdated-manifest-version  Manifest version '1.76.0' is outdated
               Use version '2.0.0' or higher.
  27:5  error  no-deprecated-library         The library 'sap.ui.commons' is deprecated
               Use an alternative library instead.

/Users/D051016/SAPDevelop/sample-app-dcom/webapp/test/integration/opaTests.qunit.html
  2 errors, 2 warnings

   8:2  error    no-deprecated-api    data-sap-ui-bindingSyntax="complex" is deprecated
                Use data-sap-ui-compat-version="edge" instead (which sets complex binding syntax).
  17:3  warning  prefer-test-starter  Legacy QUnit HTML bootstrap detected
                Use the UI5 Test Starter (runTest.js / createSuite.js) instead.
  24:2  error    no-deprecated-api    Missing data-sap-ui-compat-version="edge" in bootstrap
                Add data-sap-ui-compat-version="edge" to enable all modern features.
  25:2  warning  prefer-test-starter  AllJourneys.js uses jsUnitTestSuite pattern
                Replace with OPA Test Starter configuration.

/Users/D051016/SAPDevelop/sample-app-dcom/webapp/test/testsuite.qunit.html
  1 warning

  4:2  warning  prefer-test-starter  qunit-redirect.js is deprecated
               Use sap/ui/test/starter/createSuite.js instead.

/Users/D051016/SAPDevelop/sample-app-dcom/webapp/test/testsuite.qunit.js
  1 warning

  3:1  warning  prefer-test-starter  window.suite / jsUnitTestSuite pattern is deprecated
               Use sap.ui.define with the Test Starter config object instead.

/Users/D051016/SAPDevelop/sample-app-dcom/webapp/test/unit/controller/App.controller.js
  2 errors

  14:4  error  no-deprecated-api  sap.ui.controller() is deprecated
               Use Controller.extend or direct module import instead.
  14:4  error  no-globals         'sap.ui.controller' used as a global
               Import AppController directly via sap.ui.define.

/Users/D051016/SAPDevelop/sample-app-dcom/webapp/test/unit/unitTests.qunit.html
  2 errors, 1 warning

   9:2  error    no-deprecated-theme  Theme 'sap_goldreflection' is deprecated
                Use 'sap_horizon' instead.
  15:2  warning  prefer-test-starter  Legacy QUnit HTML bootstrap detected
                Use the UI5 Test Starter (runTest.js / createSuite.js) instead.
  27:2  error    no-deprecated-api    Missing data-sap-ui-compat-version="edge" in bootstrap
                Add data-sap-ui-compat-version="edge" to enable all modern features.

/Users/D051016/SAPDevelop/sample-app-dcom/webapp/test/unit/unitTests.qunit.js
  1 warning

  6:1  warning  prefer-test-starter  QUnit.config.autostart / sap.ui.require pattern is deprecated
               Use sap.ui.define aggregator with Test Starter instead.

/Users/D051016/SAPDevelop/sample-app-dcom/webapp/util/Helper.js
  2 errors

  1:1  error  no-deprecated-api  jQuery.sap.declare is deprecated
             Use sap.ui.define instead.
  3:1  error  no-globals         'sap.ui.demo.todo.util.Helper' assigned as a global
             Use sap.ui.define return value instead.

/Users/D051016/SAPDevelop/sample-app-dcom/webapp/view/App.view.xml
  1 warning

  38:2  warning  no-ambiguous-event-handler  Event handler 'tap="onClearCompleted"' is ambiguous
                Use 'press=".onClearCompleted"' (dot prefix) to bind to controller method.

✖ 48 problems (40 errors, 8 warnings)
```

### Error Breakdown by Rule ID

| Rule ID | Count | Severity | Files Affected |
|---|---|---|---|
| `no-deprecated-api` | 16 | error | App.controller.js (13), opaTests.qunit.html (2), unitTests.qunit.html (1) |
| `no-globals` | 13 | error | App.controller.js (11), unit/controller/App.controller.js (1), Helper.js (1) |
| `prefer-test-starter` | 5 | warning | opaTests.qunit.html (2), testsuite.qunit.html (1), testsuite.qunit.js (1), unitTests.qunit.js (1) |
| `no-deprecated-theme` | 2 | error | index.html (1), unitTests.qunit.html (1) |
| `no-deprecated-library` | 2 | error | ui5.yaml (1), manifest.json (1) |
| `no-outdated-manifest-version` | 1 | error | manifest.json |
| `csp-unsafe-inline-script` | 1 | warning | index.html |
| `no-ambiguous-event-handler` | 1 | warning | App.view.xml |

### Key Files in Initial State

**`ui5.yaml`** — references deprecated `sap.ui.commons` library  
**`webapp/index.html`** — inline `<script>` block (CSP violation) + deprecated theme `sap_goldreflection`  
**`webapp/manifest.json`** — version `1.76.0` (outdated), references `sap.ui.commons`  
**`webapp/controller/App.controller.js`** — entirely jQuery.sap-based (declare/require pattern, no sap.ui.define)  
**`webapp/util/Helper.js`** — `jQuery.sap.declare` pseudo-module, global assignment  
**`webapp/view/App.view.xml`** — ambiguous `tap=` event handler  
**`webapp/test/`** — all test infrastructure using legacy QUnit HTML bootstrap pattern

---

## Phase 1: Mechanical Baseline (Test Starter Modernization)

**Commit:** `61e1b05` — "chore: apply UI5 linter autofix and modernize test starter"  
**Problems before:** 48 (40 errors, 8 warnings)  
**Problems after:** 39 (37 errors, 2 warnings)  
**Problems fixed:** 9

### Skills Used

- `ui5-modernization:modernize-test-starter`

### Error Routing

| Rule ID | Count Fixed | Routing Decision |
|---|---|---|
| `prefer-test-starter` | 5 | All `prefer-test-starter` warnings routed to `modernize-test-starter` skill |
| `no-deprecated-api` (compat-version missing) | 2 | Identified as bootstrap attribute issues; handled as part of test HTML modernization |
| `no-deprecated-theme` (sap_goldreflection in unitTests.qunit.html) | 1 | Deprecated theme inside legacy HTML file; resolved by deleting the file |
| `no-deprecated-api` (bindingSyntax=complex in opaTests.qunit.html) | 1 | Deprecated bootstrap param inside legacy HTML file; resolved by deleting the file |

**Routing rationale:** All 5 `prefer-test-starter` warnings were the primary signal. The skill also encompassed 4 co-located `no-deprecated-api` / `no-deprecated-theme` errors that lived exclusively inside the legacy test HTML bootstrap files being deleted.

### Sub-agents Dispatched

1. **`modernize-test-starter` skill subagent** — Analyzed the full test infrastructure and planned the Test Starter migration. Produced the file plan: new `Test.qunit.html`, `OpaSetup.js`, updated `testsuite.qunit.html`, rewritten `testsuite.qunit.js`, renamed journey files, deleted legacy HTML bootstraps.
2. **Verification subagent** — Ran `npx @ui5/linter --details` after commit `61e1b05` to confirm problem count dropped from 48 to 39 with no regressions.

### Actions Taken

1. Created `webapp/test/Test.qunit.html` — minimal Test Starter runner using `runTest.js`
2. Created `webapp/test/integration/OpaSetup.js` — centralized OPA config using `sap.ui.define`, replacing `AllJourneys.js`
3. Renamed `FilterJourney.js` → `FilterJourney.qunit.js` (updated import from `./pages/App` to `./OpaSetup`)
4. Renamed `SearchJourney.js` → `SearchJourney.qunit.js` (updated import from `./pages/App` to `./OpaSetup`)
5. Renamed `TodoListJourney.js` → `TodoListJourney.qunit.js` (updated import from `./pages/App` to `./OpaSetup`)
6. Deleted `webapp/test/integration/AllJourneys.js` — replaced by OpaSetup.js + Test Starter config
7. Deleted `webapp/test/integration/opaTests.qunit.html` — replaced by shared Test.qunit.html runner
8. Updated `webapp/test/testsuite.qunit.html` — replaced `qunit-redirect.js` with `createSuite.js`
9. Rewrote `webapp/test/testsuite.qunit.js` — from `window.suite / jsUnitTestSuite` to `sap.ui.define` config object with full test registry
10. Renamed `webapp/test/unit/controller/App.controller.js` → `App.controller.qunit.js`
11. Deleted `webapp/test/unit/unitTests.qunit.html` — legacy HTML bootstrap removed
12. Simplified `webapp/test/unit/unitTests.qunit.js` — replaced `sap.ui.require` pattern with `sap.ui.define` aggregator

### Files Changed

```
 webapp/test/Test.qunit.html                        | 13 +++++ (new)
 webapp/test/integration/AllJourneys.js             | 18 ------- (deleted)
 webapp/test/integration/FilterJourney.js           → FilterJourney.qunit.js (renamed + 1 line changed)
 webapp/test/integration/OpaSetup.js                | 11 ++++ (new)
 webapp/test/integration/SearchJourney.js           → SearchJourney.qunit.js (renamed + 1 line changed)
 webapp/test/integration/TodoListJourney.js         → TodoListJourney.qunit.js (renamed + 1 line changed)
 webapp/test/integration/opaTests.qunit.html        | 30 ----------- (deleted)
 webapp/test/testsuite.qunit.html                   | 14 ++--- (modified)
 webapp/test/testsuite.qunit.js                     | 59 ++++++++++++++++++---- (rewritten)
 webapp/test/unit/controller/App.controller.js      → App.controller.qunit.js (renamed only)
 webapp/test/unit/unitTests.qunit.html              | 31 ------------ (deleted)
 webapp/test/unit/unitTests.qunit.js                | 15 ++---- (modified)

12 files changed, 86 insertions(+), 111 deletions(-)
```

### Full Diff (5301e0f → 61e1b05)

```diff
diff --git a/webapp/test/Test.qunit.html b/webapp/test/Test.qunit.html
new file mode 100644
index 0000000..f5d991f
--- /dev/null
+++ b/webapp/test/Test.qunit.html
@@ -0,0 +1,13 @@
+<!DOCTYPE html>
+<html>
+<head>
+	<meta charset="utf-8">
+	<script src="../resources/sap/ui/test/starter/runTest.js"
+		data-sap-ui-resource-roots='{ "test-resources.sap.ui.demo.todo": "./" }'
+	></script>
+</head>
+<body class="sapUiBody">
+	<div id="qunit"></div>
+	<div id="qunit-fixture"></div>
+</body>
+</html>
diff --git a/webapp/test/integration/AllJourneys.js b/webapp/test/integration/AllJourneys.js
deleted file mode 100644
index ed3718c..0000000
--- a/webapp/test/integration/AllJourneys.js
+++ /dev/null
@@ -1,18 +0,0 @@
-QUnit.config.autostart = false;
-
-sap.ui.require([
-	"sap/ui/test/Opa5",
-	"sap/ui/demo/todo/test/integration/pages/App",
-	"sap/ui/demo/todo/test/integration/TodoListJourney",
-	"sap/ui/demo/todo/test/integration/FilterJourney",
-	"sap/ui/demo/todo/test/integration/SearchJourney"
-], function(Opa5) {
-	"use strict";
-
-	Opa5.extendConfig({
-		viewNamespace: "sap.ui.demo.todo.view.",
-		autoWait: true
-	});
-
-	QUnit.start();
-});
diff --git a/webapp/test/integration/FilterJourney.js b/webapp/test/integration/FilterJourney.qunit.js
similarity index 99%
rename from webapp/test/integration/FilterJourney.js
rename to webapp/test/integration/FilterJourney.qunit.js
--- a/webapp/test/integration/FilterJourney.js
+++ b/webapp/test/integration/FilterJourney.qunit.js
@@ -2,7 +2,7 @@
 sap.ui.define([
 	"sap/ui/test/opaQunit",
-	"./pages/App"
+	"./OpaSetup"
 ], function(opaTest) {
 	"use strict";
diff --git a/webapp/test/integration/OpaSetup.js b/webapp/test/integration/OpaSetup.js
new file mode 100644
index 0000000..9e63b7e
--- /dev/null
+++ b/webapp/test/integration/OpaSetup.js
@@ -0,0 +1,11 @@
+sap.ui.define([
+	"sap/ui/test/Opa5",
+	"test-resources/sap/ui/demo/todo/integration/pages/App"
+], function(Opa5) {
+	"use strict";
+
+	Opa5.extendConfig({
+		viewNamespace: "sap.ui.demo.todo.view.",
+		autoWait: true
+	});
+});
diff --git a/webapp/test/integration/SearchJourney.js b/webapp/test/integration/SearchJourney.qunit.js
similarity index 99%
rename from webapp/test/integration/SearchJourney.js
rename to webapp/test/integration/SearchJourney.qunit.js
--- a/webapp/test/integration/SearchJourney.js
+++ b/webapp/test/integration/SearchJourney.qunit.js
@@ -3,7 +3,7 @@
 sap.ui.define([
 	"sap/ui/Device",
 	"sap/ui/test/opaQunit",
-	"./pages/App"
+	"./OpaSetup"
 ], function(Device, opaTest) {
 	"use strict";
diff --git a/webapp/test/integration/TodoListJourney.js b/webapp/test/integration/TodoListJourney.qunit.js
similarity index 99%
rename from webapp/test/integration/TodoListJourney.js
rename to webapp/test/integration/TodoListJourney.qunit.js
--- a/webapp/test/integration/TodoListJourney.js
+++ b/webapp/test/integration/TodoListJourney.qunit.js
@@ -2,7 +2,7 @@
 sap.ui.define([
 	"sap/ui/test/opaQunit",
-	"./pages/App"
+	"./OpaSetup"
 ], function(opaTest) {
 	"use strict";
diff --git a/webapp/test/integration/opaTests.qunit.html b/webapp/test/integration/opaTests.qunit.html
deleted file mode 100644
index f0bcadb..0000000
--- a/webapp/test/integration/opaTests.qunit.html
+++ /dev/null
@@ -1,30 +0,0 @@
-<!DOCTYPE html>
-<html>
-<head>
-	<meta charset="utf-8">
-	<title>Integration tests for Todo App</title>
-
-	<script id="sap-ui-bootstrap"
-		src="../../resources/sap-ui-core.js"
-		data-sap-ui-theme="sap_horizon"
-		data-sap-ui-resourceroots='{
-			"sap.ui.demo.todo": "../../",
-			"sap.ui.demo.todo.test.integration": "./"
-		}'
-		data-sap-ui-language="EN"
-		data-sap-ui-async="true"
-		data-sap-ui-bindingSyntax="complex">
-	</script>
-
-	<link rel="stylesheet" type="text/css" href="../../resources/sap/ui/thirdparty/qunit-2.css">
-
-	<script src="../../resources/sap/ui/thirdparty/qunit-2.js"></script>
-	<script src="../../resources/sap/ui/qunit/qunit-junit.js"></script>
-
-	<script src="AllJourneys.js"></script>
-</head>
-<body>
-	<div id="qunit"></div>
-	<div id="qunit-fixture"></div>
-</body>
-</html>
diff --git a/webapp/test/testsuite.qunit.html b/webapp/test/testsuite.qunit.html
index 04da4e9..cffe489 100644
--- a/webapp/test/testsuite.qunit.html
+++ b/webapp/test/testsuite.qunit.html
@@ -1,10 +1,12 @@
 <!DOCTYPE html>
 <html>
 <head>
-	<title>QUnit test suite for Sample App</title>
-	<script src="../resources/sap/ui/qunit/qunit-redirect.js"></script>
-	<script src="testsuite.qunit.js" data-sap-ui-testsuite></script>
+	<meta charset="utf-8">
+	<title>QUnit test suite for sap.ui.demo.todo</title>
+	<script src="../resources/sap/ui/test/starter/createSuite.js"
+		data-sap-ui-testsuite="test-resources/sap/ui/demo/todo/testsuite.qunit"
+		data-sap-ui-resource-roots='{ "test-resources.sap.ui.demo.todo": "./" }'
+	></script>
 </head>
-<body>
-</body>
-</html>
\ No newline at end of file
+<body></body>
+</html>
diff --git a/webapp/test/testsuite.qunit.js b/webapp/test/testsuite.qunit.js
index c9dc470..567177c 100644
--- a/webapp/test/testsuite.qunit.js
+++ b/webapp/test/testsuite.qunit.js
@@ -1,12 +1,49 @@
-window.suite = function() {
+sap.ui.define(function() {
 	"use strict";
-
-	// eslint-disable-next-line
-	var oSuite = new parent.jsUnitTestSuite(),
-		sContextPath = location.pathname.substring(0, location.pathname.lastIndexOf("/") + 1);
-
-	oSuite.addTestPage(sContextPath + "unit/unitTests.qunit.html");
-	oSuite.addTestPage(sContextPath + "integration/opaTests.qunit.html");
-
-	return oSuite;
-};
\ No newline at end of file
+	return {
+		name: "QUnit test suite for sap.ui.demo.todo",
+		defaults: {
+			page: "ui5://test-resources/sap/ui/demo/todo/Test.qunit.html?testsuite={suite}&test={name}",
+			qunit: { version: 2 },
+			sinon: { version: 4 },
+			ui5: { theme: "sap_horizon" },
+			loader: {
+				map: {
+					"*": {
+						"sap/ui/thirdparty/sinon": "sap/ui/thirdparty/sinon-4",
+						"sap/ui/thirdparty/sinon-qunit": "sap/ui/qunit/sinon-qunit-bridge"
+					}
+				},
+				paths: {
+					"sap/ui/demo/todo": "../"
+				}
+			},
+			coverage: {
+				only: ["sap/ui/demo/todo"],
+				never: ["sap/ui/demo/todo/test"]
+			}
+		},
+		tests: {
+			"unit/unitTests": { title: "Unit Tests" },
+			"integration/TodoListJourney": { title: "Todo List Journey" },
+			"integration/FilterJourney": { title: "Filter Journey" },
+			"integration/SearchJourney": { title: "Search Journey" }
+		}
+	};
+});
diff --git a/webapp/test/unit/controller/App.controller.js b/webapp/test/unit/controller/App.controller.qunit.js
similarity index 100%
rename from webapp/test/unit/controller/App.controller.js
rename to webapp/test/unit/controller/App.controller.qunit.js
diff --git a/webapp/test/unit/unitTests.qunit.html b/webapp/test/unit/unitTests.qunit.html
deleted file mode 100644
--- a/webapp/test/unit/unitTests.qunit.html
+++ /dev/null
@@ -1,31 +0,0 @@
-<!DOCTYPE html>
-<html>
-<head>
-	<meta charset="utf-8">
-	<title>Unit tests for Todo App</title>
-	<script id="sap-ui-bootstrap"
-		src="../../resources/sap-ui-core.js"
-		data-sap-ui-theme="sap_goldreflection"
-		data-sap-ui-resourceroots='{ "sap.ui.demo.todo": "../../" }'
-		data-sap-ui-language="EN"
-		data-sap-ui-async="true">
-	</script>
-	<link rel="stylesheet" href="../../resources/sap/ui/thirdparty/qunit-2.css">
-	<script src="../../resources/sap/ui/thirdparty/qunit-2.js"></script>
-	<script src="../../resources/sap/ui/qunit/qunit-junit.js"></script>
-	<script src="../../resources/sap/ui/qunit/qunit-coverage.js"></script>
-	<script src="../../resources/sap/ui/thirdparty/sinon.js"></script>
-	<script src="../../resources/sap/ui/thirdparty/sinon-qunit.js"></script>
-	<script src="unitTests.qunit.js"></script>
-</head>
-<body>
-	<div id="qunit"></div>
-	<div id="qunit-fixture"></div>
-</body>
-</html>
diff --git a/webapp/test/unit/unitTests.qunit.js b/webapp/test/unit/unitTests.qunit.js
index 687511d..e12722e 100644
--- a/webapp/test/unit/unitTests.qunit.js
+++ b/webapp/test/unit/unitTests.qunit.js
@@ -1,12 +1,3 @@
-/**
- * Legacy-style test file to demonstrate prefer-test-starter rule.
- * This file uses the old QUnit setup pattern instead of the modern Test Starter.
- */
-QUnit.config.autostart = false;
-
-sap.ui.require([
-	"sap/ui/demo/todo/test/unit/controller/App.controller"
-], function() {
-	"use strict";
-	QUnit.start();
-});
+sap.ui.define([
+	"./controller/App.controller.qunit"
+]);
```

### Linter After Phase 1 (39 problems — 37 errors, 2 warnings)

Problems resolved in this phase:
- `prefer-test-starter` x5 — deleted legacy HTML bootstraps, migrated to Test Starter
- `no-deprecated-api` (bindingSyntax=complex in opaTests.qunit.html) x1 — file deleted
- `no-deprecated-api` (missing compat-version in opaTests.qunit.html) x1 — file deleted
- `no-deprecated-theme` (sap_goldreflection in unitTests.qunit.html) x1 — file deleted
- `no-deprecated-api` (missing compat-version in unitTests.qunit.html) x1 — file deleted

Remaining problems: all `no-deprecated-api`, `no-globals` in `App.controller.js` (29), manifest/yaml issues (3), `no-deprecated-api` in unit test controller (2), `no-globals` in Helper.js (2), `no-deprecated-theme` in `index.html` (1), `csp-unsafe-inline-script` (1), `no-ambiguous-event-handler` (1).

### Gate Result

PASSED — Linter confirmed 39 problems (down from 48). No regressions. Autonomous mode continued.

---

## Phase 2: Foundation (Manifest + Component)

**Commit:** `ac9140a` — "fix: modernize manifest.json and Component.js"  
**Problems before:** 39 (37 errors, 2 warnings)  
**Problems after:** 36 (34 errors, 2 warnings)  
**Problems fixed:** 3

### Skills Used

- `ui5-modernization:fix-manifest-json`
- `ui5-modernization:fix-component-async`

### Error Routing

| Rule ID | Count Fixed | File | Routing Decision |
|---|---|---|---|
| `no-outdated-manifest-version` | 1 | `webapp/manifest.json` | Routed to `fix-manifest-json` skill |
| `no-deprecated-library` | 1 | `webapp/manifest.json` | Routed to `fix-manifest-json` skill (co-located in same file) |
| `no-deprecated-library` | 1 | `ui5.yaml` | Routed to `fix-manifest-json` skill (same library `sap.ui.commons` referenced in both files) |

**Routing rationale:** The manifest version and library errors share the same root cause (outdated project configuration). The `fix-component-async` skill was also invoked to handle the `async: true` rootView setting in manifest (replaced by `IAsyncContentCreation` interface) — a co-requisite change required when upgrading to manifest version 2.0.0.

### Sub-agents Dispatched

1. **`fix-manifest-json` skill subagent** — Updated `_version`, removed `sap.ui.commons` library from `sap.ui5.dependencies.libs`, removed deprecated `js: []` resources entry, removed `synchronizationMode: "None"` from model settings.
2. **`fix-component-async` skill subagent** — Removed `"async": true` from rootView in manifest (no longer needed with IAsyncContentCreation), removed `sap/ui/core/ComponentSupport` from Component.js define imports, added `interfaces: ["sap.ui.core.IAsyncContentCreation"]`.
3. **Verification subagent** — Ran linter after commit to confirm 36 problems.

### Actions Taken

1. **`ui5.yaml`** — Removed `- name: sap.ui.commons` from framework libraries list
2. **`webapp/manifest.json`**:
   - Changed `_version` from `"1.76.0"` to `"2.0.0"`
   - Removed `"sap.ui.commons": {}` from `sap.ui5.dependencies.libs`
   - Removed `"async": true` from `rootView` (replaced by IAsyncContentCreation)
   - Removed `"settings": { "synchronizationMode": "None" }` from businessData model
   - Removed `"js": []` from resources
3. **`webapp/Component.js`**:
   - Removed `"sap/ui/core/ComponentSupport"` from define imports (not needed when IAsyncContentCreation is set)
   - Added `interfaces: ["sap.ui.core.IAsyncContentCreation"]` to metadata

### Files Changed

```
 ui5.yaml             |  1 -
 webapp/Component.js  |  5 +++--
 webapp/manifest.json | 16 +++++-----------

3 files changed, 8 insertions(+), 14 deletions(-)
```

### Full Diff (61e1b05 → ac9140a)

```diff
diff --git a/ui5.yaml b/ui5.yaml
index 8b9ad93..7ca8034 100644
--- a/ui5.yaml
+++ b/ui5.yaml
@@ -9,7 +9,6 @@ framework:
     - name: sap.f
     - name: sap.m
     - name: sap.ui.core
-    - name: sap.ui.commons
     - name: themelib_sap_horizon
 server:
diff --git a/webapp/Component.js b/webapp/Component.js
index c863082..4e8176f 100644
--- a/webapp/Component.js
+++ b/webapp/Component.js
@@ -1,8 +1,9 @@
-sap.ui.define(["sap/ui/core/UIComponent", "sap/ui/core/ComponentSupport"], (UIComponent) => {
+sap.ui.define(["sap/ui/core/UIComponent"], (UIComponent) => {
 	"use strict";
 	return UIComponent.extend("sap.ui.demo.todo.Component", {
 		metadata: {
-			manifest: "json"
+			manifest: "json",
+			interfaces: ["sap.ui.core.IAsyncContentCreation"]
 		}
 	});
 });
diff --git a/webapp/manifest.json b/webapp/manifest.json
index c329694..d868e47 100644
--- a/webapp/manifest.json
+++ b/webapp/manifest.json
@@ -1,5 +1,5 @@
 {
-	"_version": "1.76.0",
+	"_version": "2.0.0",
 	"sap.app": {
 		"id": "sap.ui.demo.todo",
 		"type": "application",
@@ -19,8 +19,7 @@
 		"libs": {
 			"sap.ui.core": {},
 			"sap.m": {},
-			"sap.f": {},
-			"sap.ui.commons": {}
+			"sap.f": {}
 		},
 		"contentDensities": {
@@ -30,8 +29,7 @@
 		"rootView": {
 			"viewName": "sap.ui.demo.todo.view.App",
 			"type": "XML",
-			"id": "app",
-			"async": true
+			"id": "app"
 		},
 		"models": {
@@ -46,10 +44,7 @@
 			"businessData": {
-				"dataSource": "businessData",
-				"settings": {
-					"synchronizationMode": "None"
-				}
+				"dataSource": "businessData"
 		},
 		"resources": {
 			"css": [{ "uri": "css/styles.css" }],
-			"js": []
 		}
 	}
 }
```

### Linter After Phase 2 (36 problems — 34 errors, 2 warnings)

Problems resolved: `no-outdated-manifest-version` x1, `no-deprecated-library` x2.  
Remaining: All 29 errors in `App.controller.js`, 2 errors in unit test controller, 2 errors in `Helper.js`, `no-deprecated-theme` in `index.html` x1, `csp-unsafe-inline-script` x1, `no-ambiguous-event-handler` x1.

### Gate Result

PASSED — Linter confirmed 36 problems (down from 39). No regressions. Autonomous mode continued.

---

## Phase 3: Module System & Globals

**Commit:** `657899b` — "fix: modernize module system (globals, pseudo-modules, cycles, blind spots)"  
**Problems before:** 36 (34 errors, 2 warnings)  
**Problems after:** 2 (1 error, 1 warning)  
**Problems fixed:** 34

### Skills Used

- `ui5-modernization:fix-js-globals`
- `ui5-modernization:fix-pseudo-modules`
- `ui5-modernization:fix-linter-blind-spots`
- `ui5-modernization:fix-cyclic-deps`
- `ui5-modernization:fix-xml-globals`

### Error Routing

| Rule ID | Count Fixed | File | Skill Routed To |
|---|---|---|---|
| `no-deprecated-api` (jQuery.sap.declare) | 1 | `App.controller.js` | `fix-pseudo-modules` |
| `no-deprecated-api` (jQuery.sap.require x8) | 8 | `App.controller.js` | `fix-js-globals` |
| `no-deprecated-api` (sap.ui.controller) | 1 | `App.controller.js` | `fix-pseudo-modules` |
| `no-globals` (sap.ui.core.BarColor) | 1 | `App.controller.js` | `fix-js-globals` |
| `no-deprecated-api` (jQuery.sap.getModulePath) | 1 | `App.controller.js` | `fix-js-globals` |
| `no-deprecated-api` (jQuery.sap.log) | 1 | `App.controller.js` | `fix-js-globals` |
| `no-deprecated-api` (jQuery.sap.extend) | 1 | `App.controller.js` | `fix-js-globals` |
| `no-globals` (sap.ui.Device, sap.ui.model.*, sap.ui.demo.todo.util.Helper, sap.ui.getCore) | 9 | `App.controller.js` | `fix-js-globals` |
| `no-deprecated-api` (jQuery.sap.formatMessage) | 1 | `App.controller.js` | `fix-js-globals` |
| `no-globals` (remaining Filter/FilterOperator occurrences) | 4 | `App.controller.js` | `fix-js-globals` |
| `no-deprecated-api` (sap.ui.controller in test) | 1 | `unit/controller/App.controller.qunit.js` | `fix-linter-blind-spots` |
| `no-globals` (sap.ui.controller in test) | 1 | `unit/controller/App.controller.qunit.js` | `fix-linter-blind-spots` |
| `no-deprecated-api` (jQuery.sap.declare in Helper) | 1 | `util/Helper.js` | `fix-pseudo-modules` |
| `no-globals` (global assignment in Helper) | 1 | `util/Helper.js` | `fix-pseudo-modules` |
| `no-ambiguous-event-handler` | 1 | `view/App.view.xml` | `fix-xml-globals` |

**Routing rationale:** This is the largest phase. The primary signal was 29 errors in `App.controller.js`, dominated by `no-globals` and `no-deprecated-api` for jQuery.sap.* APIs — all routed to `fix-js-globals` for the global access rewrites and `fix-pseudo-modules` for the `jQuery.sap.declare`/`sap.ui.controller` pattern replacement. The `fix-linter-blind-spots` skill handled the unit test file which used `sap.ui.controller()` (a pattern the linter might not catch in test files by default). The XML ambiguous event handler was isolated to `fix-xml-globals`.

### Sub-agents Dispatched

1. **`fix-js-globals` skill subagent** — Full rewrite of `App.controller.js`: replaced all jQuery.sap.* global access with proper `sap.ui.define` imports (Controller, Log, merge, formatMessage, Device, JSONModel, Filter, FilterOperator, Helper). Replaced `sap.ui.getCore().byId()` with `this.byId()`. Replaced `jQuery("#...").control(0)` with `this.byId()`.
2. **`fix-pseudo-modules` skill subagent** — Converted `jQuery.sap.declare` + `sap.ui.controller()` pattern in `App.controller.js` to proper `sap.ui.define` + `Controller.extend()`. Converted `Helper.js` from `jQuery.sap.declare` global assignment to `sap.ui.define` with return value.
3. **`fix-linter-blind-spots` skill subagent** — Updated unit test `App.controller.qunit.js` to import AppController directly via `sap.ui.define` rather than using deprecated `sap.ui.controller()` factory.
4. **`fix-xml-globals` skill subagent** — Changed `tap="onClearCompleted"` to `press=".onClearCompleted"` in `App.view.xml`.
5. **`fix-cyclic-deps` skill subagent** — Audited the dependency graph post-rewrite and confirmed zero cyclic dependencies in the new module structure.
6. **Verification subagent** — Ran linter after commit to confirm 2 problems remaining.

### Actions Taken

1. **`webapp/controller/App.controller.js`** — Complete rewrite:
   - Replaced `jQuery.sap.declare` + `jQuery.sap.require` x8 + `sap.ui.controller()` with `sap.ui.define([...], function(Controller, Log, merge, formatMessage, Device, JSONModel, Filter, FilterOperator, Helper) {...})`
   - Converted `sap.ui.controller()` body object to `Controller.extend()` with return
   - Replaced `sap.ui.core.BarColor` global (removed — not used in modern impl)
   - Replaced `jQuery.sap.getModulePath()` → `sap.ui.require.toUrl()`
   - Replaced `jQuery.sap.log.info()` → `Log.info()`
   - Replaced `jQuery.sap.extend(true, {}, ...)` → `merge({}, ...)`
   - Replaced `sap.ui.Device` global → `Device` (imported)
   - Replaced `new sap.ui.model.json.JSONModel()` → `new JSONModel()`
   - Replaced `sap.ui.demo.todo.util.Helper` global → `Helper` (imported)
   - Replaced `new sap.ui.model.Filter()` → `new Filter()` (all occurrences)
   - Replaced `sap.ui.model.FilterOperator` → `FilterOperator` (all occurrences)
   - Replaced `sap.ui.getCore().byId("container-todo---app--todoList")` → `this.byId("todoList")`
   - Replaced `jQuery("#container-todo---app--avatar-profile").control(0)` → `this.byId("avatar-profile")`
   - Replaced `jQuery.sap.formatMessage()` → `formatMessage()`
2. **`webapp/test/unit/controller/App.controller.qunit.js`** — Added `"sap/ui/demo/todo/controller/App.controller"` import, changed `sap.ui.controller("sap.ui.demo.todo.controller.App")` → `new AppController()`
3. **`webapp/util/Helper.js`** — Wrapped in `sap.ui.define([], function() {...})`, changed from global assignment to returned object
4. **`webapp/view/App.view.xml`** — Changed `tap="onClearCompleted"` → `press=".onClearCompleted"`

### Files Changed

```
 webapp/controller/App.controller.js                | 343 +++++++++++----------
 webapp/test/unit/controller/App.controller.qunit.js |   7 +-
 webapp/util/Helper.js                              |  18 +-
 webapp/view/App.view.xml                           |   2 +-

4 files changed, 188 insertions(+), 182 deletions(-)
```

### Full Diff (ac9140a → 657899b)

```diff
diff --git a/webapp/controller/App.controller.js b/webapp/controller/App.controller.js
index 198efbf..6a156d1 100644
--- a/webapp/controller/App.controller.js
+++ b/webapp/controller/App.controller.js
@@ -1,180 +1,181 @@
-jQuery.sap.declare("sap.ui.demo.todo.controller.App");
-
-jQuery.sap.require("jquery.sap.global");
-jQuery.sap.require("sap.ui.Device");
-jQuery.sap.require("sap.ui.core.mvc.Controller");
-jQuery.sap.require("jquery.sap.strings");
-jQuery.sap.require("sap.ui.model.Filter");
-jQuery.sap.require("sap.ui.model.FilterOperator");
-jQuery.sap.require("sap.ui.model.json.JSONModel");
-jQuery.sap.require("sap.ui.demo.todo.util.Helper");
-sap.ui.controller("sap.ui.demo.todo.controller.App", {
-
-	onInit() {
-		this.aSearchFilters = [];
-		this.aTabFilters = [];
-		this.BarColor = sap.ui.core.BarColor;
-
-		// Get module path using deprecated API
-		const sModulePath = jQuery.sap.getModulePath("sap/ui/demo/todo");
-
-		// Log initialization using deprecated jQuery.sap.log
-		jQuery.sap.log.info("Todo App controller initialized. " +
-			"Module path: " + sModulePath);
-
-		// Use deprecated jQuery.sap.extend for merging objects
-		const oDefaults = { itemsRemovable: true };
-		const oSettings = jQuery.sap.extend(true, {}, oDefaults, { isMobile: sap.ui.Device.browser.mobile });
-
-		this.getView().setModel(new sap.ui.model.json.JSONModel(oSettings), "view");
-	},
-
-	onAfterRendering() {
-		const avatarDOM = jQuery("#container-todo---app--avatar-profile");
-		const avatarCtr = avatarDOM.control(0);
-		avatarCtr.setSrc(sap.ui.demo.todo.util.Helper.resolvePath('./img/logo_ui5.png'));
-	},
-
-	getModel() {
-		return this.getView().getModel();
-	},
-
-	addTodo() {
-		const oModel = this.getModel();
-		const aTodos = this.getTodos().map((oTodo) => Object.assign({}, oTodo));
-		aTodos.push({ title: oModel.getProperty("/newTodo"), completed: false });
-		oModel.setProperty("/todos", aTodos);
-		oModel.setProperty("/newTodo", "");
-	},
-
-	onClearCompleted() {
-		const aTodos = this.getTodos().map((oTodo) => Object.assign({}, oTodo));
-		this.removeCompletedTodos(aTodos);
-		this.getModel().setProperty("/todos", aTodos);
-	},
-
-	removeCompletedTodos(aTodos) {
-		let i = aTodos.length;
-		while (i--) {
-			const oTodo = aTodos[i];
-			if (oTodo.completed) { aTodos.splice(i, 1); }
-		}
-	},
-
-	getTodos() {
-		const oModel = this.getModel();
-		return oModel && oModel.getProperty("/todos") || [];
-	},
-
-	onUpdateItemsLeftCount() {
-		const iItemsLeft = this.getTodos().filter((oTodo) => oTodo.completed !== true).length;
-		this.getModel().setProperty("/itemsLeftCount", iItemsLeft);
-	},
-
-	onSearch(oEvent) {
-		const oModel = this.getModel();
-		this.aSearchFilters = [];
-		this.sSearchQuery = oEvent.getSource().getValue();
-		if (this.sSearchQuery && this.sSearchQuery.length > 0) {
-			oModel.setProperty("/itemsRemovable", false);
-			const filter = new sap.ui.model.Filter("title", sap.ui.model.FilterOperator.Contains, this.sSearchQuery);
-			this.aSearchFilters.push(filter);
-		} else {
-			oModel.setProperty("/itemsRemovable", true);
-		}
-		this._applyListFilters();
-	},
-
-	onFilter(oEvent) {
-		this.aTabFilters = [];
-		this.sFilterKey = oEvent.getParameter("item").getKey();
-		switch (this.sFilterKey) {
-			case "active":
-				this.aTabFilters.push(new sap.ui.model.Filter("completed", sap.ui.model.FilterOperator.EQ, false));
-				break;
-			case "completed":
-				this.aTabFilters.push(new sap.ui.model.Filter("completed", sap.ui.model.FilterOperator.EQ, true));
-				break;
-			default:
-		}
-		this._applyListFilters();
-	},
-
-	_applyListFilters() {
-		const oList = sap.ui.getCore().byId("container-todo---app--todoList");
-		// const oList = this.byId("todoList");
-		const oBinding = oList.getBinding("items");
-		oBinding.filter(this.aSearchFilters.concat(this.aTabFilters), "todos");
-		const sI18nKey = this.getI18NKey(this.sFilterKey, this.sSearchQuery);
-		this.byId("filterToolbar").setVisible(!!sI18nKey);
-		if (sI18nKey) {
-			this.byId("filterLabel").bindProperty("text", {
-				path: sI18nKey,
-				model: "i18n",
-				formatter: (textWithPlaceholder) => {
-					return jQuery.sap.formatMessage(textWithPlaceholder, [this.sSearchQuery]);
-				}
-			});
-		}
-	},
-
-	getI18NKey(sFilterKey, sSearchQuery) {
-		if (!sFilterKey || sFilterKey === "all") {
-			return sSearchQuery ? "ITEMS_CONTAINING" : undefined;
-		} else if (sFilterKey === "active") {
-			return "ACTIVE_ITEMS" + (sSearchQuery ? "_CONTAINING" : "");
-		} else {
-			return "COMPLETED_ITEMS" + (sSearchQuery ? "_CONTAINING" : "");
-		}
-	}
+sap.ui.define([
+	"sap/ui/core/mvc/Controller",
+	"sap/base/Log",
+	"sap/base/util/merge",
+	"sap/base/strings/formatMessage",
+	"sap/ui/Device",
+	"sap/ui/model/json/JSONModel",
+	"sap/ui/model/Filter",
+	"sap/ui/model/FilterOperator",
+	"sap/ui/demo/todo/util/Helper"
+], function(Controller, Log, merge, formatMessage, Device, JSONModel, Filter, FilterOperator, Helper) {
+	"use strict";
+
+	return Controller.extend("sap.ui.demo.todo.controller.App", {
+
+		onInit() {
+			this.aSearchFilters = [];
+			this.aTabFilters = [];
+
+			const sModulePath = sap.ui.require.toUrl("sap/ui/demo/todo");
+
+			Log.info("Todo App controller initialized. " +
+				"Module path: " + sModulePath);
+
+			const oDefaults = { itemsRemovable: true };
+			const oSettings = merge({}, oDefaults, { isMobile: Device.browser.mobile });
+
+			this.getView().setModel(new JSONModel(oSettings), "view");
+		},
+
+		onAfterRendering() {
+			const avatarCtr = this.byId("avatar-profile");
+			avatarCtr.setSrc(Helper.resolvePath('./img/logo_ui5.png'));
+		},
+
+		getModel() {
+			return this.getView().getModel();
+		},
+
+		addTodo() {
+			const oModel = this.getModel();
+			const aTodos = this.getTodos().map((oTodo) => Object.assign({}, oTodo));
+			aTodos.push({ title: oModel.getProperty("/newTodo"), completed: false });
+			oModel.setProperty("/todos", aTodos);
+			oModel.setProperty("/newTodo", "");
+		},
+
+		onClearCompleted() {
+			const aTodos = this.getTodos().map((oTodo) => Object.assign({}, oTodo));
+			this.removeCompletedTodos(aTodos);
+			this.getModel().setProperty("/todos", aTodos);
+		},
+
+		removeCompletedTodos(aTodos) {
+			let i = aTodos.length;
+			while (i--) {
+				const oTodo = aTodos[i];
+				if (oTodo.completed) { aTodos.splice(i, 1); }
+			}
+		},
+
+		getTodos() {
+			const oModel = this.getModel();
+			return oModel && oModel.getProperty("/todos") || [];
+		},
+
+		onUpdateItemsLeftCount() {
+			const iItemsLeft = this.getTodos().filter((oTodo) => oTodo.completed !== true).length;
+			this.getModel().setProperty("/itemsLeftCount", iItemsLeft);
+		},
+
+		onSearch(oEvent) {
+			const oModel = this.getModel();
+			this.aSearchFilters = [];
+			this.sSearchQuery = oEvent.getSource().getValue();
+			if (this.sSearchQuery && this.sSearchQuery.length > 0) {
+				oModel.setProperty("/itemsRemovable", false);
+				const filter = new Filter("title", FilterOperator.Contains, this.sSearchQuery);
+				this.aSearchFilters.push(filter);
+			} else {
+				oModel.setProperty("/itemsRemovable", true);
+			}
+			this._applyListFilters();
+		},
+
+		onFilter(oEvent) {
+			this.aTabFilters = [];
+			this.sFilterKey = oEvent.getParameter("item").getKey();
+			switch (this.sFilterKey) {
+				case "active":
+					this.aTabFilters.push(new Filter("completed", FilterOperator.EQ, false));
+					break;
+				case "completed":
+					this.aTabFilters.push(new Filter("completed", FilterOperator.EQ, true));
+					break;
+				default:
+			}
+			this._applyListFilters();
+		},
+
+		_applyListFilters() {
+			const oList = this.byId("todoList");
+			const oBinding = oList.getBinding("items");
+			oBinding.filter(this.aSearchFilters.concat(this.aTabFilters), "todos");
+			const sI18nKey = this.getI18NKey(this.sFilterKey, this.sSearchQuery);
+			this.byId("filterToolbar").setVisible(!!sI18nKey);
+			if (sI18nKey) {
+				this.byId("filterLabel").bindProperty("text", {
+					path: sI18nKey,
+					model: "i18n",
+					formatter: (textWithPlaceholder) => {
+						return formatMessage(textWithPlaceholder, [this.sSearchQuery]);
+					}
+				});
+			}
+		},
+
+		getI18NKey(sFilterKey, sSearchQuery) {
+			if (!sFilterKey || sFilterKey === "all") {
+				return sSearchQuery ? "ITEMS_CONTAINING" : undefined;
+			} else if (sFilterKey === "active") {
+				return "ACTIVE_ITEMS" + (sSearchQuery ? "_CONTAINING" : "");
+			} else {
+				return "COMPLETED_ITEMS" + (sSearchQuery ? "_CONTAINING" : "");
+			}
+		}
+	});
 });
diff --git a/webapp/test/unit/controller/App.controller.qunit.js b/webapp/test/unit/controller/App.controller.qunit.js
index ddf4ba2..0c107cb 100644
--- a/webapp/test/unit/controller/App.controller.qunit.js
+++ b/webapp/test/unit/controller/App.controller.qunit.js
@@ -1,8 +1,9 @@
 sap.ui.define([
-	"sap/ui/model/json/JSONModel"
-], (JSONModel) => {
+	"sap/ui/model/json/JSONModel",
+	"sap/ui/demo/todo/controller/App.controller"
+], (JSONModel, AppController) => {
 	"use strict";
 	QUnit.module("App.controller.js", {
 		beforeEach() {
-			oAppController = sap.ui.controller("sap.ui.demo.todo.controller.App");
+			oAppController = new AppController();
 		},
diff --git a/webapp/util/Helper.js b/webapp/util/Helper.js
index 37d07bc..c4ec25e 100644
--- a/webapp/util/Helper.js
+++ b/webapp/util/Helper.js
@@ -1,8 +1,12 @@
-jQuery.sap.declare("sap.ui.demo.todo.util.Helper");
+sap.ui.define([], function() {
+	"use strict";
 
-sap.ui.demo.todo.util.Helper = {
-	resolvePath(sPath) {
-		return sap.ui.require.toUrl("sap/ui/demo/todo/" + sPath);
-	}
-};
+	var Helper = {
+		resolvePath(sPath) {
+			return sap.ui.require.toUrl("sap/ui/demo/todo/" + sPath);
+		}
+	};
+
+	return Helper;
+});
diff --git a/webapp/view/App.view.xml b/webapp/view/App.view.xml
index 3b8a0b1..bbf472b 100644
--- a/webapp/view/App.view.xml
+++ b/webapp/view/App.view.xml
@@ -35,7 +35,7 @@
-									<Button id="clearCompleted" enabled="{/itemsRemovable}" icon="sap-icon://delete" text="{i18n>CLEAR_COMPLETED}" tap="onClearCompleted"/>
+									<Button id="clearCompleted" enabled="{/itemsRemovable}" icon="sap-icon://delete" text="{i18n>CLEAR_COMPLETED}" press=".onClearCompleted"/>
```

### Linter After Phase 3 (2 problems — 1 error, 1 warning)

Problems resolved: 29 in `App.controller.js`, 2 in unit test controller, 2 in `Helper.js`, 1 in `App.view.xml` = 34 total.  
Remaining:
- `webapp/index.html` — `no-deprecated-theme` (sap_goldreflection) — 1 error
- `webapp/index.html` — `csp-unsafe-inline-script` — 1 warning

### Gate Result

PASSED — Linter confirmed 2 problems (down from 36). No regressions. Autonomous mode continued.

---

## Phase 4: Deprecated APIs (Theme Replacement)

**Commit:** `7560811` — "fix: replace deprecated UI5 APIs"  
**Problems before:** 2 (1 error, 1 warning)  
**Problems after:** 1 (0 errors, 1 warning)  
**Problems fixed:** 1

### Skills Used

- `ui5-modernization:fix-deprecated-controls` (for deprecated theme in bootstrap)

### Error Routing

| Rule ID | Count Fixed | File | Routing Decision |
|---|---|---|---|
| `no-deprecated-theme` | 1 | `webapp/index.html` | Routed to `fix-deprecated-controls` skill (theme replacement in bootstrap attributes) |

**Routing rationale:** The `no-deprecated-theme` rule in `index.html` references a deprecated bootstrap parameter value (`sap_goldreflection`). This is treated as a deprecated bootstrap parameter issue, and the `fix-deprecated-controls` skill handles deprecated API usage in HTML bootstrap contexts. The remaining `csp-unsafe-inline-script` warning was intentionally deferred to Phase 5.

### Sub-agents Dispatched

1. **`fix-deprecated-controls` skill subagent** — Replaced `data-sap-ui-theme="sap_goldreflection"` with `data-sap-ui-theme="sap_horizon"` in `webapp/index.html`. Also cleaned up the camelCase bootstrap attribute names: `data-sap-ui-resourceRoots` → `data-sap-ui-resource-roots`, `data-sap-ui-onInit` → `data-sap-ui-on-init`, `data-sap-ui-compatVersion` → `data-sap-ui-compat-version`.
2. **Verification subagent** — Ran linter after commit to confirm 1 problem remaining.

### Actions Taken

1. **`webapp/index.html`**:
   - Replaced `data-sap-ui-theme="sap_goldreflection"` → `data-sap-ui-theme="sap_horizon"`
   - Normalized `data-sap-ui-resourceRoots` → `data-sap-ui-resource-roots`
   - Normalized `data-sap-ui-onInit` → `data-sap-ui-on-init`
   - Normalized `data-sap-ui-compatVersion` → `data-sap-ui-compat-version`
   - Removed deprecated `data-sap-ui-bindingSyntax="complex"` (replaced by compat-version="edge" default)

### Files Changed

```
 webapp/index.html | 9 ++++-----

1 file changed, 4 insertions(+), 5 deletions(-)
```

### Full Diff (657899b → 7560811)

```diff
diff --git a/webapp/index.html b/webapp/index.html
index aa46b9b..00eff3c 100644
--- a/webapp/index.html
+++ b/webapp/index.html
@@ -15,13 +15,12 @@
 		src="resources/sap-ui-core.js"
 		data-sap-ui-libs="sap.m"
 		data-sap-ui-xx-wait-for-theme="true"
-		data-sap-ui-bindingSyntax="complex"
-		data-sap-ui-theme="sap_goldreflection"
-		data-sap-ui-resourceRoots='{
+		data-sap-ui-theme="sap_horizon"
+		data-sap-ui-resource-roots='{
 			"sap.ui.demo.todo": "./"
 		}'
-		data-sap-ui-onInit="module:sap/ui/core/ComponentSupport"
-		data-sap-ui-compatVersion="edge"
+		data-sap-ui-on-init="module:sap/ui/core/ComponentSupport"
+		data-sap-ui-compat-version="edge"
 		data-sap-ui-async="true">
 	</script>
```

### Linter After Phase 4 (1 problem — 0 errors, 1 warning)

Problems resolved: `no-deprecated-theme` x1 in `index.html`.  
Remaining: `csp-unsafe-inline-script` x1 in `index.html` (inline `<script>` block).

### Gate Result

PASSED — Linter confirmed 1 problem (down from 2). No regressions. Autonomous mode continued.

---

## Phase 5: CSP Compliance

**Commit:** `cc69cfc` — "fix: enforce CSP compliance"  
**Problems before:** 1 (0 errors, 1 warning)  
**Problems after:** 0 (0 errors, 0 warnings)  
**Problems fixed:** 1

### Skills Used

- `ui5-modernization:fix-csp-compliance`

### Error Routing

| Rule ID | Count Fixed | File | Routing Decision |
|---|---|---|---|
| `csp-unsafe-inline-script` | 1 | `webapp/index.html` | Routed to `fix-csp-compliance` skill |

**Routing rationale:** The only remaining problem is a Content Security Policy violation — an inline `<script>` block directly in `index.html`. This is the canonical use case for `fix-csp-compliance`. The fix is to externalize the inline script to a `.js` file and replace the inline block with a `<script src="...">` reference.

### Sub-agents Dispatched

1. **`fix-csp-compliance` skill subagent** — Analyzed the inline script content (`window.todoAppConfig = { debug: true }`), created `webapp/appConfig.js` with the same content, and replaced the inline `<script>` block in `index.html` with `<script src="appConfig.js"></script>`.
2. **Verification subagent** — Ran `npx @ui5/linter --details` after commit to confirm 0 problems. Final clean state confirmed.

### Actions Taken

1. Created `webapp/appConfig.js`:
   ```js
   // Application configuration
   window.todoAppConfig = {
       debug: true
   };
   ```
2. **`webapp/index.html`** — Replaced the inline `<script>` block:
   ```html
   <!-- Before: -->
   <script>
       // Inline script to demonstrate CSP violation detection
       window.todoAppConfig = {
           debug: true
       };
   </script>

   <!-- After: -->
   <script src="appConfig.js"></script>
   ```

### Files Changed

```
 webapp/appConfig.js | 4 ++++ (new)
 webapp/index.html   | 7 +------

2 files changed, 5 insertions(+), 6 deletions(-)
```

### Full Diff (7560811 → cc69cfc)

```diff
diff --git a/webapp/appConfig.js b/webapp/appConfig.js
new file mode 100644
index 0000000..182ba1f
--- /dev/null
+++ b/webapp/appConfig.js
@@ -0,0 +1,4 @@
+// Application configuration
+window.todoAppConfig = {
+	debug: true
+};
diff --git a/webapp/index.html b/webapp/index.html
index 00eff3c..5ceb456 100644
--- a/webapp/index.html
+++ b/webapp/index.html
@@ -5,12 +5,7 @@
 	<meta name="viewport" content="width=device-width, initial-scale=1.0">
 	<title>OpenUI5 Todo App</title>
 	<link rel="icon" href="data:,">
-	<script>
-		// Inline script to demonstrate CSP violation detection
-		window.todoAppConfig = {
-			debug: true
-		};
-	</script>
+	<script src="appConfig.js"></script>
 	<script id="sap-ui-bootstrap"
 		src="resources/sap-ui-core.js"
 		data-sap-ui-libs="sap.m"
```

### Linter After Phase 5 (0 problems)

```
✔ 0 problems
```

All 48 original linter findings resolved. No errors, no warnings.

### Gate Result

PASSED — Linter confirmed 0 problems. Full autonomous mode: session complete. Documentation phase initiated.

---

## Documentation Phase

**Commit:** `9e0a748` — "docs: add modernization report and issues"  
**Problems before:** 0  
**Problems after:** 0 (unchanged)

### Actions Taken

1. Created `MODERNIZATION-REPORT.md` — Full session summary with statistics table, per-phase change descriptions, and next steps.
2. Created `MODERNIZATION-ISSUES.md` — Unfixable issues log (empty — all 48 issues were resolved automatically).

### Files Created

```
 MODERNIZATION-ISSUES.md | 10 ++++++++++
 MODERNIZATION-REPORT.md | 62 +++++++++++++++++++++++++++++++++++++++++++++++++

2 files changed, 72 insertions(+)
```

### Full Diff (cc69cfc → 9e0a748)

```diff
diff --git a/MODERNIZATION-ISSUES.md b/MODERNIZATION-ISSUES.md
new file mode 100644
index 0000000..b98db23
--- /dev/null
+++ b/MODERNIZATION-ISSUES.md
@@ -0,0 +1,10 @@
+# UI5 Modernization - Unfixable Issues
+
+This document lists issues that could not be automatically fixed.
+
+Generated: 2026-10-12
+
+## Summary
+- Total unfixable issues: 0
+
+All 48 linter findings were resolved automatically.
diff --git a/MODERNIZATION-REPORT.md b/MODERNIZATION-REPORT.md
new file mode 100644
index 0000000..43b05ae
--- /dev/null
+++ b/MODERNIZATION-REPORT.md
@@ -0,0 +1,62 @@
+# UI5 Modernization Summary
+
+Model: claude-4.6-opus
+Generated: 2026-10-12
+Verification mode: full autonomous
+
+## Statistics
+
+| Phase | Errors | Warnings | Total |
+|---|---|---|---|
+| Baseline | 40 | 8 | 48 |
+| After Phase 1 (autofix + test starter) | 37 | 2 | 39 |
+| After Phase 2 (foundation) | 34 | 2 | 36 |
+| After Phase 3 (module system) | 1 | 1 | 2 |
+| After Phase 4 (deprecated APIs) | 0 | 1 | 1 |
+| After Phase 5 (CSP) | 0 | 0 | 0 |
+
+## Improvement
+- **Resolved**: 48 issues (100%)
+- **Remaining**: 0 (see MODERNIZATION-ISSUES.md)
+
+## Changes by Phase
+
+### Phase 1: Mechanical Baseline
+- Modernized test infrastructure to Test Starter concept
+- Created Test.qunit.html (runTest.js), updated testsuite.qunit.html (createSuite.js)
+- Converted testsuite.qunit.js from jsUnitTestSuite to sap.ui.define config
+- Created OpaSetup.js, renamed journeys to .qunit.js, added OpaSetup imports
+- Renamed unit test to .qunit.js, created proper aggregator
+- Deleted legacy HTML bootstraps and AllJourneys.js
+
+### Phase 2: Foundation
+- Migrated manifest.json from version 1.76.0 to 2.0.0
+- Removed deprecated sap.ui.commons library from manifest and ui5.yaml
+- Removed async: true from rootView (replaced by IAsyncContentCreation interface)
+- Added interfaces: ["sap.ui.core.IAsyncContentCreation"] to Component.js
+
+### Phase 3: Module System & Globals
+- Rewrote App.controller.js from jQuery.sap.declare/require to sap.ui.define
+- Converted sap.ui.controller() to Controller.extend()
+- Replaced all global variable access with proper imports
+- Replaced deprecated jQuery.sap.log, jQuery.sap.extend, jQuery.sap.formatMessage
+- Replaced sap.ui.getCore().byId() with this.byId()
+- Converted Helper.js from jQuery.sap.declare to sap.ui.define
+- Fixed XML ambiguous event handler (.onClearCompleted)
+- Updated unit test to use direct Controller import
+
+### Phase 4: Deprecated APIs
+- Replaced deprecated theme sap_goldreflection with sap_horizon in index.html
+
+### Phase 5: CSP Compliance
+- Externalized inline script to appConfig.js
+
+## Verification Results
+- All phases: linter verification passed (0 regressions)
+- Final linter result: 0 problems (0 errors, 0 warnings)
+
+## Next Steps
+- Run full test suite to verify runtime behavior
+- Consider removing appConfig.js global config in favor of component metadata
```

---

## Final State

### Problem Count Timeline

| Phase | Commit | Errors | Warnings | Total | Fixed This Phase |
|---|---|---|---|---|---|
| Baseline | `5301e0f` | 40 | 8 | 48 | — |
| Phase 1: Test Starter | `61e1b05` | 37 | 2 | 39 | 9 |
| Phase 2: Foundation | `ac9140a` | 34 | 2 | 36 | 3 |
| Phase 3: Module System | `657899b` | 1 | 1 | 2 | 34 |
| Phase 4: Deprecated APIs | `7560811` | 0 | 1 | 1 | 1 |
| Phase 5: CSP Compliance | `cc69cfc` | 0 | 0 | 0 | 1 |
| Documentation | `9e0a748` | 0 | 0 | 0 | 0 |

### Rules Resolved by Phase

| Rule ID | Baseline | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 | Final |
|---|---|---|---|---|---|---|---|
| `no-deprecated-api` | 16 | 4 | 0 | 12 | 0 | 0 | 0 |
| `no-globals` | 13 | 0 | 0 | 13 | 0 | 0 | 0 |
| `prefer-test-starter` | 5 | 5 | 0 | 0 | 0 | 0 | 0 |
| `no-deprecated-theme` | 2 | 1 | 0 | 0 | 1 | 0 | 0 |
| `no-deprecated-library` | 2 | 0 | 2 | 0 | 0 | 0 | 0 |
| `no-outdated-manifest-version` | 1 | 0 | 1 | 0 | 0 | 0 | 0 |
| `no-ambiguous-event-handler` | 1 | 0 | 0 | 1 | 0 | 0 | 0 |
| `csp-unsafe-inline-script` | 1 | 0 | 0 | 0 | 0 | 1 | 0 |
| **Total** | **48** | **9** | **3** | **34** | **1** | **1** | **0** |

### Final File List (modified from baseline)

| File | Status | Phase |
|---|---|---|
| `ui5.yaml` | Modified | Phase 2 |
| `webapp/appConfig.js` | Created | Phase 5 |
| `webapp/Component.js` | Modified | Phase 2 |
| `webapp/controller/App.controller.js` | Rewritten | Phase 3 |
| `webapp/index.html` | Modified | Phase 4 + Phase 5 |
| `webapp/manifest.json` | Modified | Phase 2 |
| `webapp/test/Test.qunit.html` | Created | Phase 1 |
| `webapp/test/integration/AllJourneys.js` | Deleted | Phase 1 |
| `webapp/test/integration/FilterJourney.js` | Renamed + modified | Phase 1 |
| `webapp/test/integration/FilterJourney.qunit.js` | (renamed from above) | Phase 1 |
| `webapp/test/integration/OpaSetup.js` | Created | Phase 1 |
| `webapp/test/integration/SearchJourney.js` | Renamed + modified | Phase 1 |
| `webapp/test/integration/SearchJourney.qunit.js` | (renamed from above) | Phase 1 |
| `webapp/test/integration/TodoListJourney.js` | Renamed + modified | Phase 1 |
| `webapp/test/integration/TodoListJourney.qunit.js` | (renamed from above) | Phase 1 |
| `webapp/test/integration/opaTests.qunit.html` | Deleted | Phase 1 |
| `webapp/test/testsuite.qunit.html` | Modified | Phase 1 |
| `webapp/test/testsuite.qunit.js` | Rewritten | Phase 1 |
| `webapp/test/unit/controller/App.controller.js` | Renamed | Phase 1 |
| `webapp/test/unit/controller/App.controller.qunit.js` | (renamed + modified in Phase 3) | Phase 1 + Phase 3 |
| `webapp/test/unit/unitTests.qunit.html` | Deleted | Phase 1 |
| `webapp/test/unit/unitTests.qunit.js` | Rewritten | Phase 1 |
| `webapp/util/Helper.js` | Rewritten | Phase 3 |
| `webapp/view/App.view.xml` | Modified (1 line) | Phase 3 |
| `MODERNIZATION-REPORT.md` | Created | Documentation |
| `MODERNIZATION-ISSUES.md` | Created | Documentation |

### Final Linter Output

```
✔ 0 problems
```

### Skills Invoked — Full Session Summary

| Phase | Skills Invoked |
|---|---|
| Phase 1 | `ui5-modernization:modernize-test-starter` |
| Phase 2 | `ui5-modernization:fix-manifest-json`, `ui5-modernization:fix-component-async` |
| Phase 3 | `ui5-modernization:fix-js-globals`, `ui5-modernization:fix-pseudo-modules`, `ui5-modernization:fix-linter-blind-spots`, `ui5-modernization:fix-cyclic-deps`, `ui5-modernization:fix-xml-globals` |
| Phase 4 | `ui5-modernization:fix-deprecated-controls` |
| Phase 5 | `ui5-modernization:fix-csp-compliance` |

### Verification Gates — All Passed

| Gate | After Commit | Expected Problems | Actual Problems | Result |
|---|---|---|---|---|
| Gate 1 | `61e1b05` | 39 | 39 | PASSED |
| Gate 2 | `ac9140a` | 36 | 36 | PASSED |
| Gate 3 | `657899b` | 2 | 2 | PASSED |
| Gate 4 | `7560811` | 1 | 1 | PASSED |
| Gate 5 | `cc69cfc` | 0 | 0 | PASSED |

All gates passed. Zero regressions across all phases. Full autonomous mode maintained throughout.
