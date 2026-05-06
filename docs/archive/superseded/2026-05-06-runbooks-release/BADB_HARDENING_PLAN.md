# BADB Hardening Plan

Created: 2026-04-24

This is the working plan for stabilizing the vanilla BADB app in `BADB_main/public`
and its Express/Postgres API before doing more UI polish.

The goal is not to rewrite the app for its own sake. The goal is to make the
current system boringly reliable: restore the latest dump, start the API, run
contract checks, catch schema/API/UI drift early, and make failures legible.

## Current Feeling

The system is real and close to internal production. The database model has good
domain depth: projects, materials, recipes, tapes, electrode batches, batteries,
QC, electrochem files, activity logs, and change history are all represented.

The risk is mostly in the app layer:

- large route files mix SQL, validation, domain rules, audit logging, and HTTP
  response handling;
- the vanilla UI and API can drift from each other;
- auth and ownership rules are not consistent everywhere;
- some API code assumes looser schema rules than the database actually has;
- delete failures often surface as generic server errors instead of useful
  dependency messages.

## Guiding Order

Do hardening before UI polish unless a UI issue blocks core data entry.

The reason is practical: UI fixes are safer once API contracts and smoke tests
exist. Otherwise each visual/workflow change can accidentally break a route or
database assumption without us noticing.

## Phase 1 - Regression Harness

Status: done

Build a repeatable local validation command that:

- creates or resets a throwaway database;
- restores the latest full dump, starting with
  `BADB_main/sql_backups/0424_badb_app_v1_full.sql`;
- starts the API against that throwaway database with auth bypass;
- runs vanilla UI-facing GET smoke tests;
- runs selected create/update/delete smoke tests;
- cleans up test data and shuts down cleanly.

Expected output:

- a script under `BADB_main/scripts/`, for example
  `scripts/smoke_vanilla_api.js`;
- a documented command in `BADB_main/README.md` or this file;
- tests should fail with endpoint, status, and response body.

Acceptance criteria:

- latest dump restores without errors;
- all vanilla UI-facing GET endpoints pass;
- core write paths pass for users, projects, structures, separators,
  electrolytes, materials, recipes, tapes, electrode batches, electrodes, and
  batteries;
- no test data remains in the throwaway database.

Current command:

```bash
cd BADB_main
npm run smoke:vanilla
```

Useful variants:

```bash
npm run smoke:vanilla -- --get-only
npm run smoke:vanilla -- --keep-db --verbose
npm run smoke:vanilla -- --dump=sql_backups/0424_badb_app_v1_full.sql
```

Last verified:

- 2026-04-24: `npm run smoke:vanilla`
- Result: 129 checks, 0 failures.
- The script restored `0424_badb_app_v1_full.sql`, started the API against
  `badb_app_v1_smoke`, ran GET and write-path smoke tests, verified no smoke
  leftovers, and dropped the throwaway database.

## Phase 2 - API/UI Contract Map

Status: done

Create a source-of-truth map of the endpoints used by the vanilla app.

Artifact:

- `BADB_main/contracts/vanilla_api_endpoints.json`
- `BADB_main/scripts/check_vanilla_api_contract.js`
- `npm run contract:vanilla`

The map should include:

- page/script owner, such as `public/js/1-tapes.js`;
- method;
- endpoint path;
- required request fields;
- expected response shape at a high level;
- auth requirement.

Acceptance criteria:

- every `fetch()` in `BADB_main/public/js/**/*.js` is represented;
- variable URL helpers are explicitly documented with their possible endpoints;
- each contracted endpoint is checked against the Express route inventory;
- every local script referenced by `BADB_main/public/**/*.html` exists;
- `npm run smoke:vanilla` runs the contract check before restoring the dump;
- legacy aliases, such as `/api/tapes/:id/steps/drying`, are explicitly marked.

Last verified:

- 2026-04-24: `npm run contract:vanilla`
- Result: 122 vanilla `fetch()` calls, 108 endpoint/method contracts,
  3 dynamic fetch helpers, 192 Express routes, and 15 HTML script references
  matched.
- 2026-04-24: `npm run smoke:vanilla`
- Result: contract check passed first, then 129 API smoke checks passed with
  0 failures and the throwaway database was dropped.

## Phase 3 - Auth And Ownership Policy

Status: done for vanilla-facing ownership fields

Normalize which routes trust browser-sent user IDs and which use `req.user`.

Important decisions:

- `created_by` and `updated_by` should usually be server-derived from
  `req.user.userId`;
- reference dropdowns may remain readable with lighter auth only if this is
  intentional;
- public print/report endpoints should be explicitly documented.

Acceptance criteria:

- route-by-route auth policy exists;
- create/update routes do not allow accidental impersonation;
- unauthorized access returns clear 401/403 responses;
- auth bypass remains development-only.

Implemented:

- Added `BADB_main/docs/vanilla_auth_policy.md`.
- Made `created_by` server-derived from `req.user.userId` for projects,
  recipes, separators, electrolytes, tapes, electrode cut batches, and
  batteries.
- Made tape dry-box `updated_by` server-derived and added `auth` middleware to
  the dry-box state routes.
- Preserved explicit lab-domain operator fields such as workflow
  `performed_by`.
- Expanded `npm run smoke:vanilla` with forged `created_by` / `updated_by`
  assertions.

Last verified:

- 2026-04-25: `npm run smoke:vanilla`
- Result: contract check passed first, then 156 API smoke checks passed with
  0 failures and the throwaway database was dropped.

## Phase 4 - Better Dependency Errors

Status: done for vanilla-facing delete paths

Replace generic delete-time 500s with useful conflict messages.

Examples:

- deleting an electrolyte used by a battery should return 409 with the blocking
  battery IDs;
- deleting a separator used by battery config should return 409 with the
  blocking battery IDs;
- deleting materials, recipes, tapes, and projects should explain the dependency
  rather than just saying server error.

Acceptance criteria:

- common FK violations are caught and translated to 409;
- response body includes a human-readable message and useful blocking records;
- vanilla UI displays these messages.

Implemented:

- Added `BADB_main/utils/dependencyConflicts.js`.
- Added dependency preflight checks for deletes of projects, recipes, tapes,
  separators, separator structures, electrolytes, materials, material
  instances, electrode cut batches, electrodes, and users.
- Added fallback FK-to-409 handling so unexpected FK blockers do not become
  generic 500s.
- Expanded `npm run smoke:vanilla` with deliberate dependency-conflict checks.

Last verified:

- 2026-04-24: `npm run smoke:vanilla`
- Result: contract check passed first, then 151 API smoke checks passed with
  0 failures and the throwaway database was dropped.

## Phase 5 - Route File Decomposition

Status: done for priority vanilla route files

Split the largest route files into domain services without changing behavior.

Priority files:

- `BADB_main/routes/tapes.js`;
- `BADB_main/routes/batteries.js`;
- `BADB_main/routes/electrodes.js`;
- `BADB_main/routes/materials.js`.

Suggested pattern:

- keep Express route files thin;
- move validation helpers into `services` or `domain` modules;
- move SQL-heavy workflow operations into focused functions;
- keep behavior covered by the smoke harness before and after each extraction.

Acceptance criteria:

- no route file needs to hold an entire workflow in one place;
- extracted services can be tested or smoke-tested independently;
- no endpoint behavior changes unless explicitly planned.

Completed slices:

- Extracted tape dry-box state and drying alias helpers from
  `BADB_main/routes/tapes.js` into
  `BADB_main/services/tapeDryBoxService.js`.
- Extracted tape workflow status and mixture calculation helpers from
  `BADB_main/routes/tapes.js` into
  `BADB_main/services/tapeWorkflowService.js`.
- Extracted the tape process-step save dispatcher from
  `BADB_main/routes/tapes.js` into
  `BADB_main/services/tapeStepSaveService.js`.
- Extracted tape recipe-line actual save/read workflows from
  `BADB_main/routes/tapes.js` into
  `BADB_main/services/tapeActualService.js`.
- Extracted core tape create/list/update/delete workflows from
  `BADB_main/routes/tapes.js` into
  `BADB_main/services/tapeCatalogService.js`.
- Extracted tape read-side workflows for generic step reads, electrode-cutting
  dropdowns, per-tape cut batches, read-one, and print reports from
  `BADB_main/routes/tapes.js` into
  `BADB_main/services/tapeReadService.js`.
- Extracted tape dry-box state transition workflows from
  `BADB_main/routes/tapes.js` into
  `BADB_main/services/tapeDryBoxService.js`.
- Extracted battery capacity calculations from
  `BADB_main/routes/batteries.js` into
  `BADB_main/services/batteryCapacityService.js`.
- Extracted battery assembly/report loading from
  `BADB_main/routes/batteries.js` into
  `BADB_main/services/batteryAssemblyService.js`.
- Extracted battery header create/list/read/update workflows from
  `BADB_main/routes/batteries.js` into
  `BADB_main/services/batteryCatalogService.js`.
- Extracted compatible electrode cut-batch lookup from
  `BADB_main/routes/batteries.js` into
  `BADB_main/services/batteryCompatibleCutBatchService.js`.
- Extracted battery electrode stack saving/reading from
  `BADB_main/routes/batteries.js` into
  `BADB_main/services/batteryElectrodeStackService.js`, and fixed stack
  re-save/clear behavior so electrodes already assigned to the same battery are
  reusable and clearing a stack releases them.
- Extracted battery coin/pouch/cylindrical cell configuration workflows from
  `BADB_main/routes/batteries.js` into
  `BADB_main/services/batteryCellConfigService.js`, with added smoke coverage
  for pouch and cylindrical config writes.
- Extracted battery separator/electrolyte configuration workflows from
  `BADB_main/routes/batteries.js` into
  `BADB_main/services/batteryComponentConfigService.js`, and shifted the smoke
  reset checks through the PATCH paths.
- Extracted battery electrode-source save/read/update workflows from
  `BADB_main/routes/batteries.js` into
  `BADB_main/services/batteryElectrodeSourceService.js`.
- Extracted battery QC save/read/update workflows from
  `BADB_main/routes/batteries.js` into
  `BADB_main/services/batteryQcService.js`, with added write smoke coverage.
- Extracted battery electrochem upload/read workflows from
  `BADB_main/routes/batteries.js` into
  `BADB_main/services/batteryElectrochemService.js`, with smoke upload coverage
  and local test-file cleanup.
- Extracted electrode cut-batch capacity calculations from
  `BADB_main/routes/electrodes.js` into
  `BADB_main/services/electrodeCapacityService.js`.
- Extracted electrode cut-batch list/create/update/detail/report/delete
  workflows from `BADB_main/routes/electrodes.js` into
  `BADB_main/services/electrodeCutBatchService.js`.
- Extracted electrode foil-mass measurement add/list/update/delete workflows
  from `BADB_main/routes/electrodes.js` into
  `BADB_main/services/electrodeFoilMassService.js`.
- Extracted electrode drying save/read/update/delete workflows from
  `BADB_main/routes/electrodes.js` into
  `BADB_main/services/electrodeDryingService.js`.
- Extracted electrode list/create/update/status workflows from
  `BADB_main/routes/electrodes.js` into
  `BADB_main/services/electrodeCatalogService.js`.
- Extracted electrode delete preflight/delete workflows from
  `BADB_main/routes/electrodes.js` into
  `BADB_main/services/electrodeCatalogService.js`.
- Extracted top-level material create/list/update/delete workflows from
  `BADB_main/routes/materials.js` into
  `BADB_main/services/materialCatalogService.js`.
- Extracted material instance context/source/property helpers from
  `BADB_main/routes/materials.js` into
  `BADB_main/services/materialInstanceService.js`.
- Extracted material instance create/list/update/delete workflows from
  `BADB_main/routes/materials.js` into
  `BADB_main/services/materialInstanceService.js`.
- Extracted material composition fetch, add, update, delete, and replace logic from
  `BADB_main/routes/materials.js` into
  `BADB_main/services/materialCompositionService.js`, with smoke coverage for
  full composition replacement and row-level component edits.
- Extracted material source/property file listing, upload, download, and delete
  helpers from `BADB_main/routes/materials.js` into
  `BADB_main/services/materialFileService.js`.
- Extracted material properties and source-info load/save workflows from
  `BADB_main/routes/materials.js` into
  `BADB_main/services/materialInfoService.js`.

Last verified:

- 2026-04-26: `npm run contract:vanilla`
- Result: 122 vanilla `fetch()` calls, 108 endpoint/method contracts,
  3 dynamic fetch helpers, 192 Express routes, and 15 HTML script references
  matched.
- 2026-04-26: `npm run smoke:vanilla`
- Result: contract check passed first, then 171 API smoke checks passed with
  0 failures and the throwaway database was dropped.

## Phase 6 - Schema/API Naming Alignment

Status: done for known vanilla mismatches

Document and then reduce naming mismatches.

Known examples:

- SQL uses `specific_capacity_mah_g`;
- some API/UI code refers to `specific_capacity_mAh_g`;
- `public/js/serapators.js` appears to be a typo retained for compatibility.

Acceptance criteria:

- documented compatibility aliases exist where needed;
- new code uses one canonical spelling;
- risky renames are deferred until contract tests are in place.

Implemented:

- Added `BADB_main/docs/schema_api_naming.md`.
- Standardized material properties code on database-native
  `specific_capacity_mah_g`, while still accepting/returning
  `specific_capacity_mAh_g` as a compatibility alias.
- Updated `public/js/material-details.js` to submit
  `specific_capacity_mah_g`; kept the smoke test on the old spelling to prove
  compatibility.
- Renamed `public/js/serapators.js` to `public/js/separators.js`, updated the
  separators page and contract map, and kept `public/js/serapators.js` as a
  compatibility loader.
- Expanded `npm run contract:vanilla` to verify local HTML script references,
  so future script filename drift is caught before browser testing.

Last verified:

- 2026-04-26: `npm run contract:vanilla`
- Result: 122 vanilla `fetch()` calls, 108 endpoint/method contracts,
  3 dynamic fetch helpers, 192 Express routes, and 15 HTML script references
  matched.
- 2026-04-26: `npm run smoke:vanilla`
- Result: contract check passed first, then 171 API smoke checks passed with
  0 failures and the throwaway database was dropped.

## Phase 7 - UI Workflow Cleanup

Status: in progress

Only after the hardening layers exist, begin UI cleanup.

Good first UI targets:

- clearer save/error feedback in tape and battery workflows;
- reduce duplicated state sync logic in `1-tapes.js` and `3-batteries.js`;
- fix typos and confusing labels;
- make dependency/conflict errors readable to lab users;
- preserve the current vanilla app flow until replacements are proven.

Acceptance criteria:

- no UI change lands without smoke tests passing;
- user-visible improvements are small and reviewable;
- workflow data saved before and after the UI change is equivalent.

Implemented:

- Disabled server-owned creator selectors in the vanilla workflow and reference
  pages for tapes, electrode cut batches, batteries, projects, recipes,
  separators, and electrolytes.
- Removed browser-side save blockers and stale payload fields for audit
  `created_by` / `updated_by` values; the API now consistently derives those
  from the authenticated user.
- Preserved explicit lab-domain operator fields, such as workflow
  `performed_by` and project lead assignment.
- Updated `contracts/vanilla_api_endpoints.json` so reference/workflow
  endpoints document server-derived audit fields.
- Improved tape and battery workflow save feedback: save buttons now show a
  pending `Сохранение...` state, temporarily block duplicate clicks during the
  request, keep longer error messages readable inline, and surface structured
  API/dependency errors instead of generic save failures where possible.

Last verified:

- 2026-04-26: `npm run contract:vanilla`
- Result: 122 vanilla `fetch()` calls, 108 endpoint/method contracts,
  3 dynamic fetch helpers, 192 Express routes, and 15 HTML script references
  matched.
- 2026-04-26: `npm run smoke:vanilla`
- Result: contract check passed first, then 171 API smoke checks passed with
  0 failures and the throwaway database was dropped.

## Recent Fixes Already Made

Status: done

- Added compatibility route:
  `GET /api/tapes/:id/steps/drying?operation_code=...`.
- Fixed blank project `start_date` handling so the API respects the database
  `CURRENT_DATE` default on create and preserves the existing date on update.
- Restored the 2026-04-24 dump into a throwaway DB and confirmed core GET and
  focused write paths.

## Recommended Next Task

Continue Phase 7 with small, reviewable vanilla UI polish. Best next targets:

1. Review and implement
   `notes/BADB_BATTERY_DELETE_AND_EDIT_PLAN.md`.
2. Reduce duplicated state-sync code in `public/js/1-tapes.js` and
   `public/js/3-batteries.js`.
3. Fix remaining confusing labels and make dependency/conflict errors easier
   for lab users to act on.
