# BADB Release Readiness

Created: 2026-05-06
Edited: 2026-07-28
Status: current

This file tracks only the current release-control state. Do not use it for future ideas, long worklogs, or archived rationale.

## Current Target

Vanilla v1 release candidate for internal lab pilot.

## Current Status

- **Release candidate is the merged two-frontend app** (2026-07-28): vanilla
  + the Vue SPA served from the `:3003` root (`npm run build:web` after every
  pull). Repo migrations run through `d052`; local dev ledger `dalia = 40` /
  `dima = 21`. The migration rehearsal (`scripts/migration-test/run.sh`,
  d041→d052 on a d040 baseline with data) passes ALL CHECKS, and the vanilla
  smoke harness passes 291 checks.
- Windows/lab database ledger proof: last verified 2026-06-19 at `d040`
  (`dalia = 28` / `dima = 21`). At cutover the lab applies d041→d052 and must
  land on `dalia = 40` (see `windows_version_cutover.md`). A rehearsal against
  a FRESH lab dump is still required before cutover (the standing rehearsal
  uses the April dump).
- The `d031_harden_battery_stack_validate_trigger.sql` trigger-behavior
  boolean query (per `docs/instructions/apply_migrations.md`) has not yet
  been run on the lab and remains outstanding — run it at cutover (step 8).
- Manual destructive battery flow spot-check: **verified 2026-07-28** during
  Dalia's data-cleanup pass on dev — guided battery delete with electrode
  disposition (battery #10), tape guided deletes, electrode bulk delete with
  guard refusals, and batch delete blockers all exercised through the real
  UI. (Dev data; the flow, not the lab DB, was the subject of the check.)

## Current Source Of Truth

1. Code in `BADB_main/`.
2. SQL migrations in `migrations/`.
3. `public.schema_migrations` in the target database for applied migration state.
4. Automated checks and smoke tests.
5. Current working docs in `docs/current/`, `docs/rules/`, and `docs/instructions/`.
6. Formal mirror in `Документация ЕСПД/`.

Archived notes and generated materials are historical context only.
Flat `migrations_log.txt` files are human checkpoint notes only, not the
authoritative migration ledger.

## Recently Completed

- Guided battery delete workflow with auth-only access, typed confirmation, hard blockers, electrode disposition, owned QC/electrochem cleanup, and `activity_log`.
- Battery status workflow cleanup: derived `Открыт`, no status mutation on read,
  guarded post-assembly statuses, and legacy `disassembled` display compatibility.
- Batteries page UX follow-up: `Удалить запись` scrolls the document to the top
  so the guided delete panel is immediately visible; status dropdown visual
  emphasis and save/display behavior were corrected without changing the status
  model.
- Batteries list filters: client-side text, derived status, and form-factor
  filters with reset and empty-result messaging.
- Battery stack DB trigger hardening in `d031_harden_battery_stack_validate_trigger.sql`.
- Trigger-safe pouch/prism/cyl stack insert order: `A1, C1, A2, C2`, preserving original `position_index`.
- Migration ledger creation in `d032_create_schema_migrations_table.sql`;
  current migration files exist through Dima `020` and Dalia `d040`, with 49
  SQL files in both `migrations/` and `migrations_ASCII/`.
- Tape coating/drying schema update in
  `d033_add_coating_side2_gap_and_drying_speed.sql`.
- Wet mixing method reference update in `d034_update_wet_mixing_methods.sql`.
- Physical item creation dates in `d035_add_item_created_at_dates.sql`:
  `item_created_at` is user-facing and editable for Tapes, Electrode Batches,
  and Batteries; record `created_at` remains automatic audit metadata.
- Prism form-factor support in `d036_add_prism_form_factor.sql`: `prism` is a
  pouch-like battery/electrode target form factor until dedicated prism config
  fields are defined.
- Viscosity measurement conditions in `d037_add_viscosity_conditions.sql`:
  mixing can store optional spindle/speed notes next to viscosity.
- Manual electrode capacity-average inclusion in
  `d038_add_electrode_capacity_average_flag.sql`: individual electrodes can be
  included in or excluded from electrode batch averages independently from
  lifecycle status.
- Electrode test-batch/no-drying flag in
  `d039_add_electrode_test_batch_flag.sql`: trial cut batches can be marked as
  intentionally finished without electrode drying.
- Coated-thickness fields in `d040_add_coated_thickness_fields.sql`: tape
  coating stores measured side 1 and optional side 2 thickness after
  coating/drying and before calendering, separately from gap/zazor values.
- Vanilla smoke harness now applies the post-dump migrations needed for the
  current restored-copy schema, including `002`, `018`, `019`, `020`, and
  `d028` through `d040`.
- Battery/electrode/materials/capacity/runbook docs were compressed into the canonical docs system.
- Formal `Документация ЕСПД/` mirror was updated from the canonical docs.
- Electrolytes reference page polish: row-open workflow, sticky record header,
  typed delete confirmation, dependency preflight, file section status,
  stricter type/status validation, and unsaved-change guards.
- Vanilla reference/workflow page polish: Separators, Projects, Users, Recipes,
  and Departments now follow the row-open/sticky-header pattern appropriate to
  each page; Projects, Recipes, Electrolytes, and Separators have record print
  reports.
- UI consistency pass: button labels/tooltips, duplicate icon, filter count
  punctuation, Electrolytes/Separators record-open scroll behavior, and the coin
  create dirty-marker edge case were corrected.

## Latest Verified Checkpoint

Latest recorded release checkpoint: verified on 2026-05-25.

- `node --check` passed for the changed vanilla/backend/smoke JavaScript files.
- `git diff --check` passed.
- `npm run contract:vanilla` passed.
- UI source check confirmed the Tapes coated-thickness labels, final element
  ids, and side 2 visibility hook.
- The restored-copy smoke database applied migrations through `d040` and
  recorded authoritative `schema_migrations` rows through `d040`.
- `npm run smoke:vanilla` passed: 263 checks, 0 failures. The smoke harness
  restored the old dump and applied `002`, `018`, `019`, `020`, and `d028`
  through `d040`.

Older smoke counts below are historical only and do not replace the 2026-05-25
263-check checkpoint above.

## Lab Database Verification

Verified on 2026-06-19 (read-only; the lab database was not modified):

- Target: the Windows production/lab DB at `C:\DB_LabHIT\BADB_v1`.
- Commands (read-only): `SELECT migration_stream, count(*) FROM schema_migrations
  GROUP BY 1 ORDER BY 1;` and `SELECT migration_name FROM schema_migrations
  ORDER BY migration_name;`.
- Result: `dalia = 28`, `dima = 21` (49 rows). The migration list matches the
  expected baseline exactly — Dima `001`–`020` (two intentional `008_` files)
  and Dalia `d013`–`d040`. `d031_harden_battery_stack_validate_trigger.sql` is
  present in the ledger.
- Still outstanding: the `d031` trigger-behavior boolean query (the three
  expected booleans in `docs/instructions/apply_migrations.md`) was not run.

Forward note: as of 2026-06-19 the repo extends to `d043` (52 migration files).
The lab therefore needs `d041_project_participants.sql`,
`d042_project_leads_as_team_members.sql`, and
`d043_enable_multi_battery_electrode_sources.sql` to reach repo parity. These
three are being verified against a throwaway copy of the `d040` baseline before
any lab application.

## Historical Checkpoints

Earlier checkpoints are retained only as release history.

Verified on 2026-05-06:

- `node --check` on changed backend and vanilla JS files.
- `git diff --check`.
- `npm test` passed: 26 tests.
- `npm run contract:vanilla` passed.
- `npm run smoke:vanilla` passed: 224 checks, 0 failures.
- Canonical/formal docs link check passed.

Electrolytes documentation update verified on 2026-05-06:

- `node --check routes/electrolytes.js` passed.
- `node --check public/js/electrolytes.js` passed.
- `node --check public/js/badb-ui.js` passed.
- `npm run contract:vanilla` passed.
- `npm run smoke:vanilla` passed: 224 checks, 0 failures.
- Current/formal docs link check passed.

Battery status workflow cleanup verified on 2026-05-07:

- `node --check` passed for changed Batteries frontend/backend files.
- `git diff --check` passed.
- `npm run contract:vanilla` passed.
- `npm run smoke:vanilla` passed: 233 checks, 0 failures.
- Browser/manual status checks passed on a throwaway smoke database.

Batteries UX/status follow-up verified on 2026-05-07:

- `node --check public/js/3-batteries.js` passed.
- `git diff --check` passed.
- Browser check passed: from a mid-page scroll position, clicking
  `Удалить запись` moved the page to the top and showed the guided delete panel.
- Browser check passed for Batteries list filters: text search, derived
  `Открыт`, `pouch`, reset, and empty-result message.

Vanilla UI consistency checkpoint verified on 2026-05-08 at commit `974ffce`:

- `git diff --check HEAD~1 HEAD` passed.
- `node --check` passed for changed vanilla JavaScript files.
- `npm test` passed.
- `npm run contract:vanilla` passed: 147 fetch calls, 129 endpoint method
  contracts, 3 dynamic fetch contracts, 211 Express routes, 47 HTML script
  references, 33 HTML link references.
- `npm run smoke:vanilla` passed: 233 checks, 0 failures.
- Manual spot checks found the current UI usable; exact destructive battery
  delete and Windows/lab DB checks remain listed below until explicitly
  verified.

Current release-check commands:

```bash
git diff --check
npm test
npm run contract:vanilla
npm run smoke:vanilla
```

## Must Verify Before Pilot

- Full smoke test passes on a faithful restored copy of the pilot-target
  database. Local restored-copy smoke passed on 2026-05-25; the smoke harness
  must not be pointed at the live Windows/lab database.
- Windows/lab database proof: the Windows production/pilot DB has
  `public.schema_migrations` counts of `dima = 21` and `dalia = 28` — **ledger
  counts verified 2026-06-19** (see "Lab Database Verification" above). Still
  outstanding: the `d031` verification query from
  `docs/instructions/apply_migrations.md` returning the expected boolean values.
- Manual destructive battery flow spot-check: guided battery delete is manually
  tested for:
  - hard blocker with cycling data;
  - delete with electrodes returned as available;
  - delete with electrodes returned as scrapped;
  - owned electrochem file cleanup.
- Stack save is manually tested for:
  - coin half-cell;
  - coin full-cell;
  - pouch;
  - prism;
  - cylindrical;
  - disassembled battery with no saved stack rows;
  - cathode-first valid payload for pouch/prism/cyl.
- Battery status workflow is manually tested for:
  - incomplete record displays disabled `Открыт`;
  - completing required assembly records promotes to `Собран` through save flow;
  - complete record offers only `Собран`, `На тестировании`, `Завершён`, `Брак`;
  - legacy `disassembled` record displays as `Открыт`;
  - opening/fetching a complete record does not write status.
- Existing battery print report opens and loads data with an authenticated session.
- Electrolytes page is manually checked on the pilot target browser:
  - create;
  - edit name by title click;
  - duplicate;
  - upload/download/delete file;
  - blocked delete when used by a battery;
  - successful delete when unused;
  - unsaved-change guard on exit/logout/browser close.

## Do Not Start Before Pilot Unless Blocking

- Large UI redesign.
- New schema expansions.
- New feature families.
- Users print report and broad list-view printing; these are future ideas, not
  current-version requirements.
- Broad documentation cleanup beyond keeping current docs accurate.
- Refactors that are not required for release safety.

## Update Rule

Update this file only when release readiness changes: a required check passes/fails, a blocker is found, a blocker is removed, or the target changes.
