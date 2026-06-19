# Vanilla → Vue Parity Map

Created: 2026-06-19
Status: living document (review artifact, not a rule)

Tracks, per page/view, which vanilla v1 (`public/`) features/behaviors exist in
the Vue frontend (`client-web/`). Vanilla is the source of truth; Vue is the
in-progress replacement.

## How this was built (and its limits)

- Vanilla feature source: `docs/current/vanilla_reference_pages.md` (verified
  against code 2026-06-10), the per-domain `docs/current/*.md`, and the vanilla
  code in `public/`.
- Vue status: read from `client-web/src/` (pages, components, composables) on
  2026-06-19.
- **Test harness reality:** Vitest + `@vue/test-utils` + jsdom give a *usable
  component-test* harness (40 client-web test files); backend has 3 Vitest
  files. There is **no browser/e2e harness** (no Playwright/Cypress). So statuses
  below reflect **code inspection**, not automated end-to-end behavior proof.
  Installing a browser-e2e tool is the main gap to *prove* parity by behavior.

## Status legend

- **DONE** — present in Vue with evidence; matches vanilla intent.
- **PARTIAL** — present but diverges or incomplete (see note).
- **MISSING** — vanilla has it, Vue does not.
- **UNSURE** — not verified from code in this pass; the open question is noted.
  (Per instruction: never guessed — uncertainty is marked, not assumed.)

---

## Core workflow pages

### Tapes — `public/workflow/1-tapes.html` + `1-tapes.js` → `pages/TapesPage.vue` (+ `TapeConstructor`, `RecipeActualsEditor`, `TapeDryBoxPanel`)

| Feature (vanilla) | Vue status | Note / Question |
|---|---|---|
| List view with columns (name, project, role, recipe, created) | DONE | `TapesPage.vue` columns inc. role, recipe, operators |
| Coating sidedness shown (1-/2-sided, d024) | DONE | `col-coating_sidedness` |
| Availability/dry-box status column (in box / out / depleted) | DONE | `col-availability_status` |
| Progress indicator across stages | DONE | 8-segment `col-progress` |
| Create tape (requires project + recipe) | DONE | `EntityCreateDialog`, project+recipe+date |
| Multi-stage workflow editing | DONE (different UX) | Vue uses a multi-select **Constructor**; vanilla uses row-open. Same data, different interaction model. |
| Recipe actual masses entry | DONE | `RecipeActualsEditor` |
| Dry-box place / return / remove / deplete | DONE | `TapeDryBoxPanel` (audit #6 closed) |
| Tape export (Excel/CSV/JSON, multi-select) | DONE | `useExportTapes`, context menu |
| Duplicate (client-side draft) | DONE | `duplicateTape` → create dialog |
| Undo/redo | DONE (Vue extra) | Ctrl+Z/Y in `TapeConstructor` |
| List filters: text, status, project, role, sidedness | DONE (by design) | Vue uses `CrudTable` per-column filter overlays — accepted V2 pattern (decision 2026-06-19) |
| Print report (`tape-print.html`) | MISSING | `TapesPage` has no print button/handler; vanilla matrix lists Tapes print = yes. |
| Guided delete: opened-record only, admin/lead, delete-check, typed `DELETE TAPE <id>` | PARTIAL | Vue uses generic `CrudTable` list-delete (bare `DELETE /api/tapes/:id`, `TapesPage.vue:240-262`). Backend **does** gate to admin/lead (`routes/tapes.js:175`), so not unsafe, but **no** delete-check preflight, **no** typed phrase, **no** UI role-gating. Vanilla explicitly says don't use list-delete here. |
| Editing model (vanilla row-open vs Vue constructor) | DONE (by design) | Vue's multi-select Constructor is the accepted V2 replacement for vanilla's row-open/sticky model (decision 2026-06-19) |

### Electrodes — `public/workflow/2-electrodes.html` + `2-electrodes.js` → `pages/ElectrodesPage.vue` (+ `ElectrodeBatchPanel`, `BatchCreateDialog`, `ElectrodeBulkPasteDialog`)

| Feature (vanilla) | Vue status | Note / Question |
|---|---|---|
| List of cut batches (tape, project, type, shape, count, created) | DONE | `ElectrodesPage.vue` columns |
| Capacity columns (theoretical / actual, avg) | DONE | from `/report` capacity_summary |
| Test-batch flag (d039) | DONE | `col-is_test_batch` |
| Per-electrode include-in-capacity-average (d038) | DONE | «В среднем» per-row toggle in `ElectrodeBatchPanel` |
| Create batch (form-factor target etc.) | DONE | `BatchCreateDialog` |
| Cutting / drying / foil-mass workflow | DONE | `ElectrodeBatchPanel`: electrode mass/cup/status table + «Масса фольги» foil-mass section (`loadFoilMasses` → `/foil-masses`) |
| Bulk-paste electrode masses | DONE | `ElectrodeBulkPasteDialog` |
| Print report (`electrode-batch-print.html`) | DONE | `show-print` + `openBatchPrint` (`ElectrodesPage.vue:451,456`) |
| List filters: Role, Project, Tape | DONE (by design) | Column-overlay filters — accepted V2 pattern (decision 2026-06-19) |
| Duplicate | DONE (Vue extra) | Vue has `@duplicate=duplicateBatch`; **vanilla electrodes has NO duplicate** (0 «дублир» in `2-electrodes.js`). Vue over-implements — decide keep vs remove. |
| Guided delete: delete-check + typed `DELETE BATCH <id>` | DONE | Implemented 2026-06-19 (`utils/electrodeDelete.js` + `useDeleteCheck` checkUrl override + `TypedDeleteConfirm`): delete-check preflight → blockers OR typed «DELETE BATCH <id>» → DELETE; per-batch; auth-only (matches vanilla). Backend already enforced dependency blockers (now covered by a test). Project-based access = R1, deferred. |

### Batteries — `public/workflow/3-batteries.html` + `3-batteries.js` → `pages/AssemblyPage.vue` (+ `useBatteryState`, `BatteryElectrochemEditor`)

| Feature (vanilla) | Vue status | Note / Question |
|---|---|---|
| List (project, form factor, active materials, status, created) | DONE | `AssemblyPage.vue` columns |
| Create (project + form factor + date) | DONE | `EntityCreateDialog` |
| Form-factor config (coin/pouch/cylindrical/prism) | DONE | constructor stages |
| Electrode source selection (incl. depleted-tape handling, multi-batch d043) | DONE | per `docs/current/batteries.md` |
| Electrode stack save (trigger-safe order, stack rules) | DONE | Constructor «Сборка» stage (`batteryStages.js`). Rule enforcement + trigger-safe insert order are backend-authoritative by design (`electrode_stack_rules.md` puts ordering in the service, not the client) |
| Separator + electrolyte config | DONE | constructor stages |
| Capacity summary (theor/actual, N/P) | DONE | `capacity` panels + `CapacityHint` |
| Electrochem file attach/list/download/delete | DONE | `BatteryElectrochemEditor` |
| Status: blank/NULL/`disassembled` → «Открыт»; never «Черновик» | DONE | fixed 2026-06-16 (`utils/batteryStatus.js`); selectable = assembled/testing/completed/failed |
| Guided delete (delete-check, hard blockers, typed `DELETE BATTERY`, electrode disposition) | DONE | implemented 2026-06-16 (`utils/batteryDelete.js` + `TypedDeleteConfirm`); verified in-app |
| Duplicate (client-side draft) | DONE | `duplicateBattery` |
| Print report (`battery-print.html`) | DONE | `openBatteryPrint` + `PrintPreviewDialog` |
| Modules link / membership | N/A | Modules subsystem out of scope (decision 2026-06-19) |

---

## Reference pages

(Shared parity foundation in Vue: `RowOpenPage`, `OpenedRecordHeader`,
`useRowOpenForm`, `TypedDeleteConfirm`. Vanilla backbone:
`docs/current/vanilla_reference_pages.md` matrix.)

### Recipes — `recipes.js` → `reference/RecipesPage.vue`

| Feature | Vue status | Note |
|---|---|---|
| Row-open editing + sticky header | DONE | `RowOpenPage`/`OpenedRecordHeader` |
| Composition lines (roles, materials, % to 100) | DONE | sum-to-100 validate; role auto-set from active material |
| Filters: text, role | DONE | `filters` text + role |
| Print + duplicate (list) | DONE | `row-actions=['print','duplicate']` |
| Delete: opened-record, delete-check, typed `DELETE RECIPE` | DONE | `hasDeleteCheck:true`, `deletePhrase` |
| Files | DONE (none, by design) | vanilla recipes have no files |

### Electrolytes — `electrolytes.js` → `reference/ElectrolytesPage.vue`

| Feature | Vue status | Note |
|---|---|---|
| Row-open + sticky header | DONE | foundation |
| Filters: text, status, type | DONE | `electrolyte_type` filter present (Тип / Все типы) |
| Print + duplicate | DONE | `row-actions` |
| Delete: delete-check + typed `DELETE ELECTROLYTE` | DONE | `hasDeleteCheck:true`, phrase |
| DB-backed files (list/upload/download/delete) | DONE | `RecordFiles` |

### Separators — `separators.js` → `reference/SeparatorsPage.vue`

| Feature | Vue status | Note |
|---|---|---|
| Row-open + sticky header | DONE | foundation |
| Filters: text, status, structure | DONE | `structure_id` filter present (Структура) |
| Print + duplicate | DONE | `row-actions` |
| Delete: delete-check + typed `DELETE SEPARATOR` | DONE | phrase + `hasDeleteCheck` |
| DB-backed files | DONE | `RecordFiles` |

### Separator Structures — `separator-structures.js` → `reference/SeparatorStructuresPage.vue`

| Feature | Vue status | Note |
|---|---|---|
| Structures CRUD page | DONE | list + Dialog create/edit + delete (`SeparatorStructuresPage.vue`). Note: Dialog-edit + generic list-delete (simple справочник) |

### Materials — `materials.js` + `material-details.js` + `material-source-info.js` → `reference/MaterialsPage.vue`

| Feature | Vue status | Note |
|---|---|---|
| Material list + master-detail layout | DONE | left list + right instances/components |
| Material instances | DONE | `/materials/:id/instances` |
| Composition components (instance-level) | DONE | `componentsMap`, load/edit components |
| Source info (pure instances only) | DONE | `loadSourceInfo`, guarded to pure |
| Source/property files | DONE | `loadSourceFiles`, `RecordFiles` |
| Properties | DONE | `loadProperties` |
| Delete material | DONE | `deleteMaterial` (dependency conflicts) |
| Composition validation parity | PARTIAL | Purity (`is_pure`) backend-computed & respected ✓. BUT Vue edits components individually via `PUT/DELETE /materials/instances/components/:id`, not the canonical replace-all `PUT /materials/instances/:id/components` — so the documented sum-to-100 / no-self-dup full-composition validation may be bypassed. (Backend per-component enforcement not separately confirmed.) |

### Projects — `projects.js` → `reference/ProjectsPage.vue` (+ `ProjectAccessPanel`, access graph/matrix/timeline)

| Feature | Vue status | Note |
|---|---|---|
| Row-open + sticky header | DONE | foundation |
| Filters: text, status, access, lead | DONE | all present (`lead_id`); Vue also adds a department filter |
| Print + duplicate (list) | DONE | `row-actions` |
| Delete: backend dependency conflicts, no delete-check, no typed phrase | DONE | `hasDeleteCheck:false`, `deletePhrase:null` — matches vanilla |
| Team/participants + access grants | DONE (Vue richer) | `ProjectAccessPanel` + access graph/matrix/timeline (beyond vanilla) |
| Access labels & model | PARTIAL (fix Vue) | **Decided: match vanilla's redone permissions model.** Vue is stale — its `для отдела` option reflects the OLD department-based model vanilla moved away from. Action: align Vue to vanilla's current model; target labels **`Открытый` / `Ограниченный`** (open / restricted), internal API values stay `public`/`confidential`. |

### Users — `users.js` → `reference/UsersPage.vue`

| Feature | Vue status | Note |
|---|---|---|
| Row-open + sticky header | DONE | foundation |
| Filters: text, role, department, active | DONE | `department_id` filter present |
| Admin gating (create admin-only; edit self/others; role admin-only) | DONE | `useAuth().isAdmin`, documented in header |
| Password reset (`reset_password` toggle) | DONE | `Password` field + flag |
| Delete: opened-record, dependency conflicts, no delete-check/typed | DONE | `hasDeleteCheck:false`; matches vanilla |
| No print / duplicate / files | DONE | none present (correct) |

### Departments — `departments.js` → `reference/DepartmentsPage.vue`

| Feature | Vue status | Note |
|---|---|---|
| Row-open + sticky header | DONE | foundation (handoff's "no Vue dept page" is stale) |
| Filters: text, head | DONE | `filters` text + (head) |
| Admin-only create/update | DONE | `isAdmin` gate; non-admin inputs disabled |
| No delete / print / duplicate / files | DONE | none present (matches vanilla) |

### Modules — `public/workflow/4-modules.html`

| Feature | Vue status | Note |
|---|---|---|
| Modules subsystem | N/A (out of scope) | Stub in vanilla, absent in Vue; deferred by decision (2026-06-19) — not a tracked gap. |

---

## Cross-cutting

| Area | Vue status | Note |
|---|---|---|
| Login / auth session | DONE | `LoginPage.vue` + `stores/auth.js` (tested); JWT + token_version |
| Navigation / menu | DONE (Vue richer) | `AppSidebar` + `navigation.js` + mobile drawer; vanilla is a static link menu |
| Print infrastructure | DONE | `PrintPreviewDialog` proxies vanilla `/workflow/*-print.html` for batteries, electrodes, recipes, electrolytes, separators, projects |
| List filter pattern | DONE (by design) | Reference pages = vanilla-style filter bars; workflow pages = `CrudTable` column overlays (accepted V2 pattern, 2026-06-19) |
| Destructive-delete pattern | PARTIAL | Reference pages + Batteries match vanilla (opened-record / guided / typed where vanilla has it); **Tapes & Electrodes still use generic list-delete** (see those rows) |
| Authenticated report windows | DONE | reports load in-app via `PrintPreviewDialog` (auth handled) |

## Vue-only (no vanilla equivalent — nothing to map, listed for completeness)

Cycling (`CyclingPage` + charts), Dashboard/Home (`HomePage`, pipeline, graph),
Access (`AccessPage`), Activity (`ActivityPage`), Audit (`AuditPage`), Feedback
(`FeedbackPage`), Profile (`ProfilePage`), Design System (`DesignSystemPage`).

---

## Summary

### Counts by status (feature rows above)

| Status | Count |
|---|---|
| DONE | ~79 (incl. "DONE by design" V2 choices) |
| PARTIAL | 4 |
| MISSING | 1 |
| UNSURE | 0 (all resolved 2026-06-19) |
| N/A (out of scope) | 2 (Modules) |

(Counts are of the feature rows in this document; indicative, not exact.)

### Actionable gaps (priority order)

1. ~~**Electrodes — guided delete.**~~ **DONE 2026-06-19** — delete-check + typed `DELETE BATCH <id>` (`utils/electrodeDelete.js` + `useDeleteCheck` + `TypedDeleteConfirm`).
2. **Tapes — guided delete (PARTIAL).** Same generic list-delete; backend gates to admin/lead but no delete-check / typed phrase / UI gate. Next up — same pattern as Electrodes/Batteries.
3. **Tapes — print (MISSING).** No `tape-print` button/handler; vanilla has it.
4. **Projects — access labels & model (PARTIAL).** Align Vue to vanilla's redone permissions model; drop the stale `для отдела` (old department model) and relabel to `Открытый` / `Ограниченный`.
5. **Materials — composition validation (PARTIAL).** Per-component edits bypass the canonical sum-to-100 / full-composition validation endpoint.

### Themes

- **Tapes guided delete is the top remaining workflow-page gap** — the same generic-list-delete issue already fixed for Batteries and Electrodes (2026-06-19); reuse `useDeleteCheck` + `TypedDeleteConfirm`.
- Most pages are **at parity**; the May `frontend_parity_handoff.md` "pending" list is largely stale (Recipes / Electrolytes / Separators / Departments / Users all DONE).
- Vue's **Constructor + column-filter** model on workflow pages is an accepted V2 redesign, not a gap (decision 2026-06-19).
- **All UNSURE items from the first pass were resolved on 2026-06-19** — via code reads (filters, foil-mass, separator-structures, materials path, access labels) and the owner's interview answers (UX model, access model, modules scope, depth).
