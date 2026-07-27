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
| Active material select on tape (d047: grouped by family, role-filtered vs recipe; slot line instances from tape's material) | DONE | implemented in both frontends together 2026-07-16 |
| Wet-mixing auto-select from DB windows (d048) | DONE | was vanilla-only hardcoded thresholds; both frontends now read auto_min/max_volume_ml — Vue gained the auto-select 2026-07-17 |
| Mixing container + milling balls + ⅓-volume suggestion (d048, Vilitek) | DONE | implemented in both frontends together 2026-07-17; shown only for methods with uses_containers/uses_balls |
| Dry-box place / return / remove / deplete | DONE | `TapeDryBoxPanel` (audit #6 closed) |
| Tape export (Excel/CSV/JSON, multi-select) | DONE | `useExportTapes`, context menu |
| Duplicate (client-side draft) | DONE | `duplicateTape` → create dialog |
| Undo/redo | DONE (Vue extra) | Ctrl+Z/Y in `TapeConstructor` |
| List filters: text, status, project, role, sidedness | DONE (by design) | Vue uses `CrudTable` per-column filter overlays — accepted V2 pattern (decision 2026-06-19) |
| Print report (`tape-print.html`) | DONE | Implemented 2026-06-20 (`utils/tapePrint.js` + `openTapePrint` + `show-print`/`@print` + `PrintPreviewDialog`) — opens `/workflow/tape-print.html?tape_id=<id>` in-app, mirroring Electrodes/Batteries. |
| Guided delete: admin/lead, delete-check, typed `DELETE TAPE <id>` | DONE | Implemented 2026-06-20 (`utils/tapeDelete.js` + `useDeleteCheck` + `TypedDeleteConfirm`): `authStore.isLead` UI gate → delete-check preflight → blockers OR typed «DELETE TAPE <id>» → DELETE; per-tape. Backend already gates admin/lead + enforces dependency blockers (now covered by a test). |
| Editing model (vanilla row-open vs Vue constructor) | DONE (by design) | Vue's multi-select Constructor is the accepted V2 replacement for vanilla's row-open/sticky model (decision 2026-06-19) |
| Table QoL: default 20 rows, shrink-to-fit on column deselect, «Выбрано: N — показать» selection lens | DONE (Vue extra) | CrudTable 2026-07-17 — vanilla has no column selector, nothing to mirror |

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
| Electrode № (number_in_batch) as default sort + click-sortable headers | DONE | Both frontends 2026-07-17; server now lists electrodes in № order; bulk paste commits in paste order so № matches the Excel sheet |
| Electrode bulk delete (checkboxes → one confirm listing №s) | DONE (Vue extra) | ElectrodeBatchPanel 2026-07-17; guard-refused rows reported per-row in one toast |
| «Стаканчик №» (cup_number) | RETIRED | Removed from ALL UI both frontends 2026-07-17 (nobody records it; comments field covers it); DB column deprecated in place per forward-only policy |

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
| Multi-source electrode rows per role (pouch/prism/cyl) | DONE | ElectrodeSourcesEditor 2026-07-17: depleted-tape marking « — списана», shape-compat + sibling-dedup filtering, batch→tape backfill, «— сначала выберите форм-фактор —» hint; saves via ARRAY mode of the electrode-sources PATCH (closed the legacy flat-key data-loss path) |
| Stack picker: № column + sortable headers | DONE | number_in_batch shown in vanilla pickers/stack summary/battery print 2026-07-17 (data now in assembly payload) |
| Coin layout wording «Схема расположения сепаратора и электролита» (E-S-E/E-S/S-E) | DONE | verbatim from vanilla 2026-07-17; stray «Схема укладки» duplicate field removed (silently nulled coin_layout) |
| Capacity wording «расч. (по факт. массам)» / «по рецепту» | DONE | ported from vanilla rework 2026-07-17 incl. tooltips |
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
| Active line as open slot (d047: no material, «x — выбирается на ленте») | DONE | implemented in both frontends together 2026-07-16 |
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
| Family label (d047: «Семейство» field, create/edit + display) | DONE | implemented in both frontends together 2026-07-16 |
| Material instances | DONE | `/materials/:id/instances` |
| Composition components (instance-level) | DONE | `componentsMap`, load/edit components |
| Source info (pure instances only) | DONE | `loadSourceInfo`, guarded to pure |
| Source/property files | DONE | `loadSourceFiles`, `RecordFiles` |
| Properties | DONE | `loadProperties` |
| Delete material | DONE | `deleteMaterial` (dependency conflicts) |
| Composition validation parity | DONE | Done 2026-06-20 (`utils/materialComposition.js`): Vue now has a vanilla-style **full-composition editor** (multi-row, client-side sum-to-100 ±0.0001 + no-self + no-dup) that saves via the canonical replace-all `PUT /materials/instances/:id/components` (server re-validates). Replaces the old per-component `POST` add, which carried no whole-composition validation. Inline per-component ✏️/🗑 edit/delete kept as-is — **vanilla leaves those un-revalidated too**, so this is exact parity (verified against `public/js/materials.js`). Purity (`is_pure`) still backend-computed & respected. Tests: frontend util (14) + backend contract via mocked pool (10). Note: the per-component `POST` endpoint's missing server-side validation is a pre-existing backend wart, unreachable from either UI after this — flagged as a **separate follow-up**, not a parity gap. |

### Projects — `projects.js` → `reference/ProjectsPage.vue` (+ `ProjectAccessPanel`, access graph/matrix/timeline)

| Feature | Vue status | Note |
|---|---|---|
| Row-open + sticky header | DONE | foundation |
| Filters: text, status, access, lead | DONE | all present (`lead_id`); Vue also adds a department filter |
| Print + duplicate (list) | DONE | `row-actions` |
| Delete: backend dependency conflicts, no delete-check, no typed phrase | DONE | `hasDeleteCheck:false`, `deletePhrase:null` — matches vanilla |
| Team/participants + access grants | DONE (Vue richer) | `ProjectAccessPanel` + access graph/matrix/timeline (beyond vanilla). Граф reworked to a force-directed membership constellation 2026-06-24 (`utils/accessGraphModel.js` + `AccessGraph.vue`, branch `dalia/access-graph-redesign`) — see `docs/future/access_graph_redesign.md`. |
| Access labels & model | DONE | Done 2026-06-20 (`utils/projectAccess.js`): Vue now uses `открытый` / `ограниченный` (lowercase, matching vanilla + the app's option convention); the `department` access option is dropped (legacy `department` displays + filters as `ограниченный`). Vanilla was already correct — no change. Entity-route authz is the separate R1 item (deferred). |

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
| Destructive-delete pattern | DONE | All guided deletes match vanilla — reference pages, Batteries, **Electrodes (2026-06-19) and Tapes (2026-06-20)** now use delete-check + typed phrase + correct permission gate. |
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
| DONE | ~84 (incl. "DONE by design" V2 choices) |
| PARTIAL | 0 |
| MISSING | 0 |
| UNSURE | 0 (all resolved 2026-06-19) |
| N/A (out of scope) | 2 (Modules) |

(Counts are of the feature rows in this document; indicative, not exact.)

### Actionable gaps (priority order)

1. ~~**Electrodes — guided delete.**~~ **DONE 2026-06-19** — delete-check + typed `DELETE BATCH <id>` (`utils/electrodeDelete.js` + `useDeleteCheck` + `TypedDeleteConfirm`).
2. ~~**Tapes — guided delete.**~~ **DONE 2026-06-20** — `authStore.isLead` gate + delete-check + typed `DELETE TAPE <id>` (`utils/tapeDelete.js`).
3. ~~**Tapes — print.**~~ **DONE 2026-06-20** — `show-print` + `PrintPreviewDialog` opens `/workflow/tape-print.html` (`utils/tapePrint.js`).
4. ~~**Projects — access labels & model.**~~ **DONE 2026-06-20** — Vue uses `открытый`/`ограниченный`, department option dropped (`utils/projectAccess.js`); vanilla already correct.
5. ~~**Materials — composition validation (PARTIAL).**~~ **DONE 2026-06-20** — Vue gained a vanilla-style full-composition editor (sum-to-100 validated) saving via the canonical replace-all PUT (`utils/materialComposition.js`); inline per-component edit/delete kept (vanilla parity). **This closes the last parity gap.**

### Themes

- **All parity gaps are now closed (2026-06-20).** Materials composition validation was the last one — Vue now matches vanilla's sum-to-100 full-composition editor. All workflow-page guided deletes + Tapes print + Projects access labels + Materials composition are DONE; everything else is DONE/by-design. (Separate from parity: R1 project-based authz — see `docs/future/project_access_control.md`; and a pre-existing backend wart — the unvalidated per-component `POST` endpoint — flagged as a follow-up.)
- Most pages are **at parity**; the May `frontend_parity_handoff.md` "pending" list is largely stale (Recipes / Electrolytes / Separators / Departments / Users all DONE).
- Vue's **Constructor + column-filter** model on workflow pages is an accepted V2 redesign, not a gap (decision 2026-06-19).
- **All UNSURE items from the first pass were resolved on 2026-06-19** — via code reads (filters, foil-mass, separator-structures, materials path, access labels) and the owner's interview answers (UX model, access model, modules scope, depth).
