# Frontend Parity Handoff

Created: 2026-05-07
Edited: 2026-05-09
Status: instruction

This is the handoff for Dima/Claude when the Vue frontend needs to match
vanilla v1 behavior. For the surfaces below, vanilla v1 is the reference
behavior. If Vue and vanilla differ, treat Vue as stale until Dalia says
otherwise.

Do not use this file to add new product requirements, edit ESPD/ЕСПД docs, or
design behavior that vanilla v1 does not already have.

## Source Of Truth

For parity work, use this order:

1. current vanilla v1 page behavior in `public/`;
2. matching `docs/current/` and `docs/rules/` files;
3. implemented backend/API behavior needed to support the vanilla flow;
4. this handoff as Dima's Vue task list.

Archived/generated material and `docs/future/` are not parity sources unless a
current doc explicitly points to them.

## Vanilla V1 Reference Map

Vue must use vanilla v1 as the reference behavior for these surfaces:

| Surface | Vanilla reference |
| --- | --- |
| Tapes | `docs/current/tapes.md`, `public/workflow/1-tapes.html`, `public/js/1-tapes.js` |
| Electrode batches | `docs/current/electrodes.md`, `public/workflow/2-electrodes.html`, `public/js/2-electrodes.js` |
| Batteries | `docs/current/batteries.md`, `docs/rules/battery_lifecycle_rules.md`, `docs/rules/electrode_stack_rules.md`, `public/workflow/3-batteries.html`, `public/js/3-batteries.js` |
| Electrolytes | `docs/current/electrolytes.md`, `public/reference/electrolytes.html`, `public/js/electrolytes.js` |
| Separators | `docs/current/separators.md`, `public/reference/separators.html`, `public/js/separators.js` |
| Projects | `docs/current/projects.md`, `public/reference/projects.html`, `public/js/projects.js` |
| Recipes | `docs/current/recipes.md`, `public/reference/recipes.html`, `public/js/recipes.js` |
| Users | `docs/current/users.md`, `public/reference/users.html`, `public/js/users.js` |
| Departments | `docs/current/departments.md`, `public/reference/departments.html`, `public/js/departments.js` |

The shared reference-page matrix lives in
`docs/current/vanilla_reference_pages.md`. Shared labels, filters, sticky
headers, and destructive-flow placement live in
`docs/instructions/vanilla_ui_patterns.md`.

## Current Vue Parity Gaps

### Destructive And Safety Flows

Status: pending
Priority: release blocker
Vue evidence: current Vue pages commonly use `CrudTable` context-menu delete
plus `SaveIndicator`, then call DELETE directly from list-selected rows.
Expected Vue behavior:

- Tapes: delete only from the opened tape record; require admin/lead access,
  `GET /api/tapes/:id/delete-check`, blocker display before confirmation, and
  typed phrase `DELETE TAPE <id>`.
- Electrode batches: delete only from the opened batch/workspace; call
  `GET /api/electrodes/electrode-cut-batches/:id/delete-check`, show blockers,
  and require typed phrase `DELETE BATCH <id>`.
- Batteries: use the vanilla guided delete flow, not direct list delete. Call
  `GET /api/batteries/:id/delete-check`, show hard blockers before final
  confirmation, keep route access auth-only, require
  `DELETE BATTERY <battery_id>`, and require linked-electrode disposition
  (`available` or `scrapped`) when linked electrodes exist.
- Recipes: delete only from the opened recipe record; call
  `GET /api/recipes/:id/delete-check`, show tape-usage blockers, and require
  typed phrase `DELETE RECIPE <tape_recipe_id>`.
- Projects: delete only from the opened project record; there is no standalone
  delete-check and no typed phrase. Use ordinary confirmation and surface
  backend dependency conflicts for linked tapes, electrode batches, and
  batteries.
- Users: delete only from the opened user record when allowed; there is no
  standalone delete-check and no typed phrase. Use ordinary confirmation and
  surface backend dependency conflicts. Keep the vanilla page pattern: no
  list-level print, no duplicate, and no list-row delete action.
- Departments: Vue does not currently expose a department reference page. If it
  is added, match vanilla exactly: row-open view/edit, sticky Save/Exit header,
  admin-only create/update, filters by text/head, and no delete, print,
  duplicate, files, or delete-check.

Do not keep generic multi-row context-menu delete for these parity surfaces
where vanilla deletes only from the opened record.

### Electrolytes And Separators

Status: pending
Priority: high
Vue evidence: `client-web/src/pages/reference/ElectrolytesPage.vue` and
`client-web/src/pages/reference/SeparatorsPage.vue` still use dialog editing,
direct DELETE, no file section, no record report button, and no delete-check
preflight.
Expected Vue behavior:

- row summary opens the record in-page, not in a modal-only CRUD flow;
- opened record has the vanilla sticky header with save, print, exit, delete,
  dirty flag, compact metadata, and inline status;
- filters match vanilla: Electrolytes use text/status/type; Separators use
  text/status/structure; result count lives below the filter controls;
- list actions stay separate from row-open: print and duplicate are list-level
  buttons where vanilla exposes them;
- record reports use `/workflow/electrolyte-print.html?electrolyte_id=<id>` and
  `/workflow/separator-print.html?sep_id=<id>` backed by
  `GET /api/electrolytes/:id/report` and `GET /api/separators/:id/report`;
- files are DB-backed and must support list, upload, authenticated download,
  and delete through the current electrolyte/separator file routes;
- record deletion must call delete-check first, show blockers before typed
  confirmation, and require `DELETE ELECTROLYTE <id>` or
  `DELETE SEPARATOR <id>`.

Do not add project filters or project links to Electrolytes or Separators.
Vanilla does not have those links today.

### Batteries And Assembly Status

Status: pending
Priority: high
Vue evidence: `client-web/src/pages/AssemblyPage.vue` still labels blank status
as `Черновик`, includes a `draft` display path, and comments assume
`GET /api/batteries/:id/assembly` has a hidden status-promotion side effect.
Expected Vue behavior:

- display blank/`NULL` and legacy `disassembled` as derived `Открыт`;
- never offer `Открыт`, blank, `draft`, or `disassembled` as selectable status
  values;
- after required assembly records exist, allow only `assembled`, `testing`,
  `completed`, and `failed`, displayed as `Собран`, `На тестировании`,
  `Завершён`, and `Брак`;
- do not rely on `/assembly` reads to mutate status. Ordinary read/report
  endpoints must be treated as pure reads for status; status promotion happens
  only through the explicit save/status workflow and the UI must re-render from
  the backend response;
- stack saving must preserve the current trigger-safe pouch/prism/cylindrical rules
  from `docs/rules/electrode_stack_rules.md` and must not revive stale
  `/assembly` side-effect assumptions.

### Row-Open Pages, Headers, And Filters

Status: pending
Priority: normal
Vue evidence: several Vue surfaces still inherit generic `CrudTable` behavior
instead of the polished vanilla v1 opened-record pattern.
Expected Vue behavior:

- Tapes, Electrode batches, Batteries, Projects, Recipes, Users,
  Electrolytes, Separators, and Departments should match the current vanilla
  page pattern for their page type: row-open primary content, separate list
  action buttons, opened-record sticky header where vanilla has one, and save
  keeping the record open;
- filters should be page-specific client-side filters over the loaded list,
  with reset controls and count text below the filter block;
- do not add print, duplicate, delete, delete-check, or files to a page where
  vanilla does not expose them.

### Project Access Labels

Status: pending
Priority: normal
Vue evidence: `client-web/src/pages/reference/ProjectsPage.vue` still maps
project access to stale labels such as `Открытый`, `Отдельский`, and
`Конфиденциальный`.
Expected Vue behavior:

- field/filter label: `Доступ`;
- all-filter option: `Все уровни доступа`;
- `public`: `для всех`;
- `department`: `для отдела`;
- `confidential`: `выборочный доступ`;
- list metadata should read like `доступ: для всех`, `доступ: для отдела`, or
  `доступ: выборочный доступ`.

Do not show stale project access labels such as `Открытый`,
`Конфиденциальный`, `Видимость`, or `публичный` where vanilla now uses the
approved Russian labels. Internal API values may remain `public`, `department`,
and `confidential`.

### Recipes And Users Page Pattern

Status: pending
Priority: normal
Vue evidence: Recipes and Users currently use modal CRUD flows plus generic
table delete rather than the vanilla opened-record safety pattern.
Expected Vue behavior:

- Recipes: row-open editing, text/material-name and role filters, list-level
  print and duplicate, opened-record sticky save/print/exit/delete, report via
  `GET /api/recipes/:id/report`, delete-check before typed delete, and no
  recipe file attachments.
- Users: row-open editing, admin-visible add action, field disabling when the
  current user cannot manage the opened user, password reset only when chosen,
  opened-record sticky save/exit/delete when allowed, ordinary delete
  confirmation with backend dependency errors, and no print, duplicate, files,
  or delete-check route.

## Recommended Dima Order

1. Destructive/safety behavior first: remove unsafe direct list deletes and
   match vanilla delete-check/confirmation/dependency handling.
2. Reports, files, and delete-check next: especially Electrolytes, Separators,
   Recipes, Tapes, Electrode batches, and Batteries.
3. Row-open, sticky headers, and page-specific filters after safety is correct.
4. Label cleanup last: project access labels and any remaining stale status or
   button language.

## Maintenance Rules

- Keep this file short and current.
- Close or remove stale parity items quickly.
- Link to current/rule docs instead of duplicating full specs.
- Do not use `docs/future/` as a substitute for parity tracking.
