# BADB VBA Dependency Graph
**Generated:** 2026-03-13
**Codebase:** /sessions/gallant-optimistic-darwin/mnt/BADB/client/src/

---

## Module Inventory (31 files)

| Module Name | Category | Type | File Path |
|---|---|---|---|
| AppContext | class | .cls | classes/AppContext.cls |
| cmdAuth | command | .bas | commands/cmdAuth.bas |
| cmdLoad | command | .bas | commands/cmdLoad.bas |
| cmdSync | command | .bas | commands/cmdSync.bas |
| cmdAdd | command | .bas | commands/cmdAdd.bas |
| cmdFindID | command | .bas | commands/cmdFindID.bas |
| cmdFindStage | command | .bas | commands/cmdFindStage.bas |
| cmdFindAllStages | command | .bas | commands/cmdFindAllStages.bas |
| cmdChartsToggle | command | .bas | commands/cmdChartsToggle.bas |
| cmdShare | command | .bas | commands/cmdShare.bas |
| cmdNewTemplate | command | .bas | commands/cmdNewTemplate.bas |
| cmdSelfTest | command | .bas | commands/cmdSelfTest.bas |
| cfgApp | config | .bas | config/cfgApp.bas |
| modRouter | router | .bas | ribbon/modRouter.bas |
| modDBUI_2026 | ribbon | .bas | ribbon/modDBUI_2026.bas |
| svcAuth | service | .bas | services/svcAuth.bas |
| svcHttp | service | .bas | services/svcHttp.bas |
| svcJson | service | .bas | services/svcJson.bas |
| svcLoad | service | .bas | services/svcLoad.bas |
| svcSubmit | service | .bas | services/svcSubmit.bas |
| svcSearch | service | .bas | services/svcSearch.bas |
| svcPackages | service | .bas | services/svcPackages.bas |
| svcCharts | service | .bas | services/svcCharts.bas |
| svcWorkbook | service | .bas | services/svcWorkbook.bas |
| svcNavigation | service | .bas | services/svcNavigation.bas |
| svcAccess | service | .bas | services/svcAccess.bas |
| svcTemplates | service | .bas | services/svcTemplates.bas |
| utilError | utility | .bas | utils/utilError.bas |
| utilLog | utility | .bas | utils/utilLog.bas |
| modBuild | utility | .bas | utils/modBuild.bas |
| frmAddTape | form | .frm | forms/frmAddTape.frm |

---

## Dependency Map: Module → Dependencies

### Classes

**AppContext** (.cls)
- *No dependencies*
- Public properties: UserName, Role, IsAuthorized, Token, LastLoadResponse, SelectedProjectID, RootPath
- Methods: Reset, Property Let/Get

---

### Commands (Entry Points)

**cmdAuth** (.bas)
- **Depends on:** `AppContext`, `svcAuth`, `utilError`
- **Signature:** `Public Sub Run(ByVal ctx As AppContext)`
- **Functionality:** Prompts for login/password, calls svcAuth.Authenticate, displays result

**cmdLoad** (.bas)
- **Depends on:** `AppContext`, `svcLoad`
- **Signature:** `Public Sub Run(ByVal ctx As AppContext)`
- **Functionality:** Gets project IDs from user input, calls svcLoad.LoadProjects

**cmdSync** (.bas)
- **Depends on:** `AppContext`, `svcSubmit`, `svcPackages`, `cfgApp`
- **Signature:** `Public Sub Run(ByVal ctx As AppContext)`
- **Functionality:** Creates sync JSON package, submits to server or file queue with fallback

**cmdAdd** (.bas)
- **Depends on:** `AppContext`, `frmAddTape`, `svcJson`, `svcSubmit`
- **Signature:** `Public Sub Run(ByVal ctx As AppContext)`
- **Functionality:** Shows form, collects tape data, builds JSON, submits with fallback

**cmdFindID** (.bas)
- **Depends on:** `AppContext`, `svcSearch`
- **Signature:** `Public Sub Run(ByVal ctx As AppContext)`
- **Functionality:** Prompts for ID, searches ctx.LastLoadResponse via svcSearch.FindById

**cmdFindStage** (.bas)
- **Depends on:** `AppContext`, `svcSearch`
- **Signature:** `Public Sub Run(ByVal ctx As AppContext)`
- **Functionality:** Prompts for stage code, searches ctx.LastLoadResponse via svcSearch.FindByStage

**cmdFindAllStages** (.bas)
- **Depends on:** `AppContext`, `svcSearch`
- **Signature:** `Public Sub Run(ByVal ctx As AppContext)`
- **Functionality:** Iterates 7 stage types, calls svcSearch.CountMatches on each, displays summary

**cmdChartsToggle** (.bas)
- **Depends on:** `AppContext`, `svcCharts`
- **Signature:** `Public Sub Run(ByVal ctx As AppContext, ByVal pressed As Boolean)`
- **Functionality:** Calls svcCharts.Charts_ApplyVisibility (stub)

**cmdShare** (.bas)
- **Depends on:** None (stub - "Not implemented yet")
- **Signature:** `Public Sub Run(ByVal ctx As AppContext)`

**cmdNewTemplate** (.bas)
- **Depends on:** None (stub - "Not implemented yet")
- **Signature:** `Public Sub Run(ByVal ctx As AppContext)`

**cmdSelfTest** (.bas)
- **Depends on:** `AppContext`, `cmdAuth`
- **Public methods:**
  - `Public Sub Run(ByVal ctx As AppContext)` — calls RunAll
  - `Public Sub RunAll()` — creates context, calls cmdAuth.Run, displays result

---

### Routing & UI Callbacks

**modRouter** (.bas)
- **Depends on:** `AppContext`, `cfgApp`, `utilLog`, `Application.Run` (runtime dispatch)
- **Public methods:**
  - `Router_GetContext() As AppContext` — lazy-init singleton context
  - `Router_IsAuthorized() As Boolean`
  - `Router_GetChartsPressed() As Boolean`
  - `Router_SetChartsPressed(pressed As Boolean)`
  - `Router_RunCommand(cmdKey As String)` — dispatch to cmd*.Run by key
  - `Router_RunToggle(cmdKey As String, pressed As Boolean)` — dispatch to cmd*.Run with boolean

**modDBUI_2026** (.bas)
- **Depends on:** `modRouter`, `cfgApp`
- **Public methods (ribbon callbacks):**
  - `DBUI_2026_OnRibbonLoad(ribbon As Object)`
  - `DBUI_2026_Invalidate()`
  - `DBUI_2026_GetEnabled(control As Object, returnedVal)` — enables buttons based on authorization
  - `DBUI_2026_GetChartsPressed(control As Object, returnedVal)`
  - `DBUI_2026_OnLogin/OnLoadData/OnSync/OnShare/OnAdd/OnFindID/OnFindAllStages/OnFindStage/OnNewTemplate(control As Object)` — route to Router

---

### Configuration

**cfgApp** (.bas)
- **Depends on:** None (constants only)
- **Exports:**
  - Command keys: CMD_LOGIN, CMD_LOAD, CMD_SYNC, CMD_SHARE, CMD_ADD, CMD_FIND_ID, CMD_FIND_STAGE, CMD_FIND_ALL_STAGES, CMD_NEW_TEMPLATE, CMD_CHARTS_TOGGLE
  - Role constants: ROLE_GUEST, ROLE_EMPLOYEE, ROLE_MANAGER, ROLE_ADMIN
  - Sheet anchors: ANCHOR_PROJECTS, ANCHOR_STAGES, ANCHOR_STAGEVALUES
  - Queue paths: QUEUE_ROOT_WIN, QUEUE_DIR_INBOX, QUEUE_DIR_PROCESSED, etc.
  - Server URLs: SERVER_URL, API_AUTH, API_PROJECTS, API_SUBMIT, API_REFERENCES

---

### Services

**svcAuth** (.bas)
- **Depends on:** `AppContext`, `svcHttp`, `cfgApp`, `utilLog`, `utilError`
- **Public methods:**
  - `Authenticate(ctx As AppContext, login As String, password As String) As Boolean` — POSTs to /api/auth, parses JSON response (token, role, userName)
  - `Auth_Clear(ctx As AppContext)` — resets context to Guest

**svcHttp** (.bas)
- **Depends on:** `cfgApp`, `utilLog`
- **Public methods:**
  - `HttpGet(url As String, token As String) As String` — GET with Bearer token, 30s timeout, raises on HTTP error
  - `HttpPost(url As String, body As String, token As String) As String` — POST JSON with Bearer token
  - `HttpAuth(url As String, login As String, password As String) As String` — POST for /api/auth (no Bearer)
  - `IsHttpOk(statusCode As Long) As Boolean` — 200-299 check
- **Implementation:** MSXML2.ServerXMLHTTP.6.0 (Windows only, raises on Mac)

**svcJson** (.bas)
- **Depends on:** `AppContext`, `utilError`
- **Public methods:**
  - `BuildTapePreparePackage(ctx As AppContext, tape As Collection) As String` — builds JSON envelope + payload per tape_prepare.v1 contract
- **Private helpers:** buildActualsArray, buildStepsArray, buildParamsObject, jsonStr, jsonNum, jsonEsc, colVal, generateSubmissionId, getMachineName, isNumericParam

**svcLoad** (.bas)
- **Depends on:** `AppContext`, `svcHttp`, `cfgApp`, `utilError`, `utilLog`
- **Public methods:**
  - `LoadProjects(ctx As AppContext, projectIds As String) As Boolean` — GET /api/projects?ids=... stores response in ctx.LastLoadResponse
  - `LoadReferences(ctx As AppContext, refType As String) As String` — GET /api/references/:type

**svcSubmit** (.bas)
- **Depends on:** `AppContext`, `svcHttp`, `svcPackages`, `cfgApp`, `utilError`, `utilLog`
- **Public methods:**
  - `SubmitPackage(ctx As AppContext, jsonPayload As String) As Boolean` — POST to /api/submit with Bearer token
  - `SubmitWithFallback(ctx As AppContext, jsonPayload As String) As Boolean` — tries HTTP, falls back to svcPackages.Packages_WriteJson

**svcSearch** (.bas)
- **Depends on:** None
- **Public methods:**
  - `FindById(response As String, entityId As String) As String` — searches JSON for "tape_id" or "project_id", returns object fragment
  - `FindByStage(response As String, stageCode As String) As String` — finds all objects with "operation_type":"stageCode"
  - `CountMatches(response As String, searchTerm As String) As Long` — simple substring count
- **Private helpers:** extractObject, findKeyValue, findObjectStart, skipString (JSON parser helpers)

**svcPackages** (.bas)
- **Depends on:** `AppContext`, `cfgApp`, `utilError`
- **Public methods:**
  - `Packages_Prepare(ctx As AppContext)` — creates queue folder structure
  - `Packages_WriteJson(ctx As AppContext, requestType As String, jsonText As String) As String` — writes JSON to inbox with atomic rename
  - `Packages_GetUserInboxFolder(ctx As AppContext) As String` — returns user-specific inbox path
- **Private helpers:** Packages_UserSafe, Packages_NewRequestId, DetectSep, PathCombine, EnsureFolder, FolderExists, SafeDeleteFile

**svcCharts** (.bas)
- **Depends on:** `AppContext`, `utilError`
- **Public methods:**
  - `Charts_ApplyVisibility(ctx As AppContext, showCharts As Boolean)` — stub

**svcWorkbook** (.bas)
- **Depends on:** `cfgApp`
- **Public methods:**
  - `Workbook_GetHostWorkbook() As Workbook`
  - `Workbook_GetNamedRange(rangeName As String) As Range`
  - `Workbook_ReadNamedValue(rangeName As String) As Variant`
  - `GetDatabaseWorkbookReadOnly(ctx As AppContext) As Workbook` — opens Database_1.xlsm read-only
  - `FindTable(wb As Workbook, tableName As String) As Object` — searches ListObjects

**svcNavigation** (.bas)
- **Depends on:** `utilError`
- **Public methods:**
  - `Nav_GotoAnchor(targetWb As Workbook, anchorName As String)` — navigates to named range in workbook

**svcAccess** (.bas)
- **Status:** DEPRECATED — scheduled for removal (moved to svcAuth.Authenticate + AppContext.Role)
- **Depends on:** None

**svcTemplates** (.bas)
- **Depends on:** `AppContext`, `utilError`
- **Public methods:**
  - `Templates_CreateNew(ctx As AppContext)` — stub

---

### Utilities

**utilError** (.bas)
- **Depends on:** None
- **Public methods:**
  - `RaiseAppError(procName As String, msg As String)` — raises vbObjectError + 512

**utilLog** (.bas)
- **Depends on:** None
- **Public methods:**
  - `LogError(procName As String, errNum As Long, errDesc As String)` — Debug.Print timestamp + error

**modBuild** (.bas)
- **Depends on:** None (build utilities only)
- **Public methods:**
  - `Build_ShowRootPath()`
  - `Build_Export_All_From_ThisWorkbook()`
  - `Build_Import_All_Into_ThisWorkbook()`
  - `Build_Make_Addin()` — creates DatabaseUI.xlam from template
- **Private helpers:** Export/Import file I/O, VBIDE component manipulation (80+ lines)

---

### Forms

**frmAddTape** (.frm)
- **Depends on:** `AppContext`
- **Public interface:**
  - `Context` property (Let) — sets mCtx
  - `WasSubmitted` property (Get) — returns whether form was submitted
  - `GetTapeData() As Collection` — returns Collection with keys: project_id, tape_recipe_id, tape_name, tape_status, notes, actuals, steps
- **Controls:** cboProject, cboRecipe, txtTapeName, cboStatus, txtNotes, btnSubmit, btnCancel
- **Lifecycle:** UserForm_Initialize (populate dropdowns), btnSubmit_Click (validate), btnCancel_Click (cancel), UserForm_QueryClose (trap X button)

---

## Dependency Layers (Bottom-Up)

### Layer 0: No Dependencies
- `cfgApp` (configuration constants)
- `utilError` (error raising)
- `utilLog` (logging)
- `svcSearch` (JSON search helpers)

### Layer 1: Foundation Services
- `AppContext` (class - used by all)
- `svcHttp` → depends on cfgApp, utilLog
- `svcPackages` → depends on cfgApp, utilError
- `svcNavigation` → depends on utilError
- `svcWorkbook` → depends on cfgApp
- `modBuild` → depends on nothing (build utilities)

### Layer 2: Mid-Tier Services
- `svcAuth` → depends on AppContext, svcHttp, cfgApp, utilLog, utilError
- `svcLoad` → depends on AppContext, svcHttp, cfgApp, utilError, utilLog
- `svcJson` → depends on AppContext, utilError
- `svcSubmit` → depends on AppContext, svcHttp, svcPackages, cfgApp, utilError, utilLog
- `svcCharts` → depends on AppContext, utilError
- `svcTemplates` → depends on AppContext, utilError
- `svcAccess` → DEPRECATED

### Layer 3: Commands (Entry Points)
- `cmdAuth` → depends on AppContext, svcAuth, utilError
- `cmdLoad` → depends on AppContext, svcLoad
- `cmdSync` → depends on AppContext, svcSubmit, svcPackages, cfgApp
- `cmdAdd` → depends on AppContext, frmAddTape, svcJson, svcSubmit
- `cmdFindID` → depends on AppContext, svcSearch
- `cmdFindStage` → depends on AppContext, svcSearch
- `cmdFindAllStages` → depends on AppContext, svcSearch
- `cmdChartsToggle` → depends on AppContext, svcCharts
- `cmdShare` → no dependencies (stub)
- `cmdNewTemplate` → no dependencies (stub)
- `cmdSelfTest` → depends on AppContext, cmdAuth

### Layer 4: UI & Routing
- `frmAddTape` → depends on AppContext
- `modRouter` → depends on AppContext, cfgApp, utilLog, all cmd* modules (via Application.Run)
- `modDBUI_2026` → depends on modRouter, cfgApp

---

## Cross-Module Dependency Summary

| Module | Incoming Refs | Outgoing Refs | Coupling Strength |
|---|---|---|---|
| AppContext | 25+ | 0 | Core; read-only |
| cfgApp | 15+ | 0 | High; config used everywhere |
| utilError | 7+ | 0 | Medium; error raising |
| utilLog | 6+ | 0 | Low; logging only |
| svcHttp | 3 (svcAuth, svcLoad, svcSubmit) | 2 (cfgApp, utilLog) | Medium |
| svcAuth | 1 (cmdAuth) | 3 (svcHttp, cfgApp, utilLog) | Medium |
| svcLoad | 1 (cmdLoad) | 3 (svcHttp, cfgApp, utilLog) | Medium |
| svcJson | 1 (cmdAdd) | 1 (AppContext) | Low |
| svcSubmit | 2 (cmdAdd, cmdSync) | 3 (svcHttp, svcPackages, cfgApp) | Medium |
| svcSearch | 3 (cmdFindID, cmdFindStage, cmdFindAllStages) | 0 | Low |
| svcPackages | 2 (cmdSync, svcSubmit) | 2 (cfgApp, utilError) | Medium |
| modRouter | 0 | 10+ (all cmd* via Application.Run) | High; dispatcher |
| modDBUI_2026 | 0 | 1 (modRouter) + cfgApp | High; ribbon callbacks |

---

## Critical Paths

### Authentication Flow
```
modDBUI_2026.DBUI_2026_OnLogin
  → modRouter.Router_RunCommand("Login")
    → Application.Run "cmdAuth.Run", ctx
      → svcAuth.Authenticate(ctx, login, password)
        → svcHttp.HttpAuth(url, login, password)
          → ctx.IsAuthorized = True / False
```

### Data Load Flow
```
modDBUI_2026.DBUI_2026_OnLoadData
  → modRouter.Router_RunCommand("Load")
    → Application.Run "cmdLoad.Run", ctx
      → svcLoad.LoadProjects(ctx, projectIds)
        → svcHttp.HttpGet(url, ctx.Token)
          → ctx.LastLoadResponse = response
```

### Data Submission Flow
```
modDBUI_2026.DBUI_2026_OnAdd
  → modRouter.Router_RunCommand("Add")
    → Application.Run "cmdAdd.Run", ctx
      → frmAddTape.Show (modal)
        → svcJson.BuildTapePreparePackage(ctx, tape)
          → svcSubmit.SubmitWithFallback(ctx, jsonPayload)
            → svcHttp.HttpPost(url, jsonPayload, ctx.Token) [primary]
            → svcPackages.Packages_WriteJson(ctx, "Submit", jsonPayload) [fallback]
```

### Search Flow
```
modDBUI_2026.DBUI_2026_OnFindID
  → modRouter.Router_RunCommand("FindID")
    → Application.Run "cmdFindID.Run", ctx
      → svcSearch.FindById(ctx.LastLoadResponse, entityId)
        (pure string manipulation; no external calls)
```

---

## Architectural Notes

1. **Singleton Context:** modRouter maintains a single AppContext instance (lazy-initialized in Router_GetContext)
2. **No Circular Dependencies:** Clean layered architecture; all flows are acyclic
3. **HTTP is Centralized:** All network I/O routes through svcHttp (platform: Windows only, Mac raises error)
4. **JSON is Handwritten:** No external JSON library; svcJson builds strings manually per tape_prepare.v1 schema
5. **Error Handling:** Standardized on On Error Resume Next + utilError.RaiseAppError + utilLog.LogError
6. **File Queue Fallback:** Submission failures automatically save to svcPackages inbox for later retry
7. **UI Isolation:** Forms (frmAddTape) know only AppContext, not routing or services
8. **Stub Modules:** cmdShare, cmdNewTemplate, svcCharts, svcTemplates are currently stubs (show not-implemented messages or do nothing)

---

## Files Analyzed

- ✓ 31 source files (.bas, .cls, .frm) in /sessions/gallant-optimistic-darwin/mnt/BADB/client/src/
- ✓ 11 command modules
- ✓ 12 service modules
- ✓ 1 class module (AppContext)
- ✓ 2 router/ribbon modules
- ✓ 1 configuration module
- ✓ 3 utility modules
- ✓ 1 form module
- ✓ 1 build utility module
