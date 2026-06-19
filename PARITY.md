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
| List filters: text, status, project, role, sidedness | PARTIAL | Vue relies on `CrudTable` per-column filter overlays, not vanilla's dedicated filter bar. Q: do the overlays cover all 5 vanilla filter dimensions equivalently? |
| Print report (`tape-print.html`) | MISSING | `TapesPage` has no print button/handler; vanilla matrix lists Tapes print = yes. |
| Guided delete: opened-record only, admin/lead, delete-check, typed `DELETE TAPE <id>` | PARTIAL | Vue uses generic `CrudTable` list-delete (bare `DELETE /api/tapes/:id`, `TapesPage.vue:240-262`). Backend **does** gate to admin/lead (`routes/tapes.js:175`), so not unsafe, but **no** delete-check preflight, **no** typed phrase, **no** UI role-gating. Vanilla explicitly says don't use list-delete here. |
| Sticky opened-record header (Сохранить/Печать/Выйти/Удалить) | PARTIAL | Tapes is a constructor page in Vue, not row-open; sticky-header pattern N/A as built. Q: is parity expected to keep vanilla's row-open+sticky model, or is the constructor an accepted replacement? |

### Electrodes — `public/workflow/2-electrodes.html` + `2-electrodes.js` → `pages/ElectrodesPage.vue` (+ `ElectrodeBatchPanel`, `BatchCreateDialog`, `ElectrodeBulkPasteDialog`)

| Feature (vanilla) | Vue status | Note / Question |
|---|---|---|
| List of cut batches (tape, project, type, shape, count, created) | DONE | `ElectrodesPage.vue` columns |
| Capacity columns (theoretical / actual, avg) | DONE | from `/report` capacity_summary |
| Test-batch flag (d039) | DONE | `col-is_test_batch` |
| Per-electrode include-in-capacity-average (d038) | DONE | per-row flag (per docs); Q: confirm toggle UI present in `ElectrodeBatchPanel` |
| Create batch (form-factor target etc.) | DONE | `BatchCreateDialog` |
| Cutting / drying / foil-mass workflow | DONE | `ElectrodeBatchPanel`; Q: confirm foil-mass grid + per-electrode masses fully match vanilla |
| Bulk-paste electrode masses | DONE | `ElectrodeBulkPasteDialog` |
| Print report (`electrode-batch-print.html`) | DONE | `show-print` + `openBatchPrint` (`ElectrodesPage.vue:451,456`) |
| List filters: Role, Project, Tape | PARTIAL | Top filter-bar removed (comment `ElectrodesPage.vue:36`); column-overlay filters only. Q: do overlays cover Role/Project/Tape as vanilla's bar did? |
| Duplicate | UNSURE | No `@duplicate` seen on `ElectrodesPage` CrudTable. Q: does vanilla electrodes expose duplicate? If yes, Vue is MISSING it. |
| Guided delete: delete-check + typed `DELETE BATCH <id>` | MISSING | Vue uses generic list-delete (`ElectrodesPage.vue:385-393`, bare `DELETE …/electrode-cut-batches/:id`). Backend is `auth`-only (no role/phrase enforcement, `routes/electrodes.js:156`); a `/delete-check` route exists but Vue does not call it. |

### Batteries — `public/workflow/3-batteries.html` + `3-batteries.js` → `pages/AssemblyPage.vue` (+ `useBatteryState`, `BatteryElectrochemEditor`)

| Feature (vanilla) | Vue status | Note / Question |
|---|---|---|
| List (project, form factor, active materials, status, created) | DONE | `AssemblyPage.vue` columns |
| Create (project + form factor + date) | DONE | `EntityCreateDialog` |
| Form-factor config (coin/pouch/cylindrical/prism) | DONE | constructor stages |
| Electrode source selection (incl. depleted-tape handling, multi-batch d043) | DONE | per `docs/current/batteries.md` |
| Electrode stack save (trigger-safe order, stack rules) | DONE | Q: confirm full pouch/prism/cyl stack-rule UI validation matches `electrode_stack_rules.md` |
| Separator + electrolyte config | DONE | constructor stages |
| Capacity summary (theor/actual, N/P) | DONE | `capacity` panels + `CapacityHint` |
| Electrochem file attach/list/download/delete | DONE | `BatteryElectrochemEditor` |
| Status: blank/NULL/`disassembled` → «Открыт»; never «Черновик» | DONE | fixed 2026-06-16 (`utils/batteryStatus.js`); selectable = assembled/testing/completed/failed |
| Guided delete (delete-check, hard blockers, typed `DELETE BATTERY`, electrode disposition) | DONE | implemented 2026-06-16 (`utils/batteryDelete.js` + `TypedDeleteConfirm`); verified in-app |
| Duplicate (client-side draft) | DONE | `duplicateBattery` |
| Print report (`battery-print.html`) | DONE | `openBatteryPrint` + `PrintPreviewDialog` |
| Modules link / membership | UNSURE | Q: does vanilla batteries surface module info? Vue `4-modules` equivalent is a placeholder. |

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
| Filters: text, status, type | PARTIAL | text+status confirmed; **type** filter not confirmed in this pass. Q: is the `type` filter present? |
| Print + duplicate | DONE | `row-actions` |
| Delete: delete-check + typed `DELETE ELECTROLYTE` | DONE | `hasDeleteCheck:true`, phrase |
| DB-backed files (list/upload/download/delete) | DONE | `RecordFiles` |

### Separators — `separators.js` → `reference/SeparatorsPage.vue`

| Feature | Vue status | Note |
|---|---|---|
| Row-open + sticky header | DONE | foundation |
| Filters: text, status, structure | PARTIAL | text+status confirmed; **structure** filter not confirmed. Q: present? |
| Print + duplicate | DONE | `row-actions` |
| Delete: delete-check + typed `DELETE SEPARATOR` | DONE | phrase + `hasDeleteCheck` |
| DB-backed files | DONE | `RecordFiles` |

### Separator Structures — `separator-structures.js` → `reference/SeparatorStructuresPage.vue`

| Feature | Vue status | Note |
|---|---|---|
| Structures CRUD page | UNSURE | Page exists; not read this pass. Q: does it match vanilla `separator-structures` features (list/create/edit/delete)? |

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
| Exact field/validation parity with vanilla materials | UNSURE | Vue uses its own master-detail pattern, not the foundation. Q: confirm composition validation (mass-fraction, no self/dup, total 100%) + purity rules match `material_composition_rules.md`. |

### Projects — `projects.js` → `reference/ProjectsPage.vue` (+ `ProjectAccessPanel`, access graph/matrix/timeline)

| Feature | Vue status | Note |
|---|---|---|
| Row-open + sticky header | DONE | foundation |
| Filters: text, status, access, lead | PARTIAL | text+status+access confirmed; **lead** filter not confirmed. Q: present? |
| Print + duplicate (list) | DONE | `row-actions` |
| Delete: backend dependency conflicts, no delete-check, no typed phrase | DONE | `hasDeleteCheck:false`, `deletePhrase:null` — matches vanilla |
| Team/participants + access grants | DONE (Vue richer) | `ProjectAccessPanel` + access graph/matrix/timeline (beyond vanilla) |
| Access labels | UNSURE | Vue shows `для всех` / `для отдела` / `выборочный доступ` + filter `Все уровни доступа`; docs (`vanilla_ui_patterns.md`) say vanilla uses `открытый` / `секретный` + `Все типы доступа`. Q: which labels does **current** vanilla `projects.js` actually show? |

### Users — `users.js` → `reference/UsersPage.vue`

| Feature | Vue status | Note |
|---|---|---|
| Row-open + sticky header | DONE | foundation |
| Filters: text, role, department, active | PARTIAL | text+role+active confirmed; **department** filter not confirmed. Q: present? |
| Admin gating (create admin-only; edit self/others; role admin-only) | DONE | `useAuth().isAdmin`, documented in header |
| Password reset (`reset_password` toggle) | DONE | `Password` field + flag |
| Delete: opened-record, dependency conflicts, no delete-check/typed | DONE | `hasDeleteCheck:false`; matches vanilla |
| No print / duplicate / files | DONE | none present (correct) |

### Departments — `departments.js` → `reference/DepartmentsPage.vue`

| Feature | Vue status | Note |
|---|---|---|
| Row-open + sticky header | DONE | foundation (handoff's "no Vue dept page" is stale) |
| Filters: text, head | DONE | `filters` text + (head) |
| Admin-only create/update | UNSURE | Q: confirm create/update gated to admin as vanilla requires |
| No delete / print / duplicate / files | DONE | none present (matches vanilla) |

### Modules — `public/workflow/4-modules.html`

| Feature | Vue status | Note |
|---|---|---|
| Modules subsystem | MISSING (both) | Vanilla 4-modules is a documented stub; Vue has no real modules page (placeholder). Not a regression — neither implements it. |

---

## Cross-cutting

| Area | Vue status | Note |
|---|---|---|
| Login / auth session | DONE | `LoginPage.vue` + `stores/auth.js` (tested); JWT + token_version |
| Navigation / menu | DONE (Vue richer) | `AppSidebar` + `navigation.js` + mobile drawer; vanilla is a static link menu |
| Print infrastructure | DONE | `PrintPreviewDialog` proxies vanilla `/workflow/*-print.html` for batteries, electrodes, recipes, electrolytes, separators, projects |
| List filter pattern | PARTIAL | Reference pages use vanilla-style dedicated filter bars; workflow pages (Tapes, Electrodes) use `CrudTable` column overlays instead |
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
| DONE | ~46 |
| PARTIAL | 9 |
| MISSING | 3 |
| UNSURE | 11 |

(Counts are of the feature rows in this document; treat as indicative, not exact.)

### Pages with the most gaps (priority order)

1. **Electrodes** — guided delete MISSING (generic list-delete, no delete-check/typed phrase, backend unenforced); filters PARTIAL; duplicate UNSURE.
2. **Tapes** — print MISSING; guided delete PARTIAL (generic list-delete, no delete-check/typed/UI-gate); filters PARTIAL; row-open vs constructor model difference.
3. **Projects** — access label mismatch (UNSURE which is current vanilla); lead filter UNSURE. Otherwise strong (Vue adds access viz).
4. **Materials** — feature-complete but on a bespoke pattern; composition/purity validation parity UNSURE.
5. **Separator Structures** — whole page UNSURE (not yet read).

### Biggest themes

- **Workflow-page deletes (Tapes, Electrodes) are the clearest real gap** — same generic-list-delete issue that was just fixed for Batteries. Recommended next parity work, mirroring the battery fix (`useDeleteCheck` + `TypedDeleteConfirm`).
- **Tapes print** is the one missing report.
- Most **reference pages are at parity** via the shared foundation; the May `frontend_parity_handoff.md` "pending" list is largely stale.
- Several **UNSURE** items are quick to resolve by reading specific files (filter configs, separator-structures page, current vanilla project access labels) — listed as questions, not guesses.
