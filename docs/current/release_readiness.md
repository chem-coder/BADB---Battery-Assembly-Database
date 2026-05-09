# BADB Release Readiness

Created: 2026-05-06
Edited: 2026-05-09
Status: current

This file tracks only the current release-control state. Do not use it for future ideas, long worklogs, or archived rationale.

## Current Target

Vanilla v1 release candidate for internal lab pilot.

## Current Status

- Vanilla v1 is a release candidate based on the recorded local automated
  checks and UI spot checks.
- Windows/lab database proof is still required before pilot use. The target
  database must show current `public.schema_migrations` counts and the
  `d031_harden_battery_stack_validate_trigger.sql` trigger behavior on the
  Windows/lab database itself.
- Manual destructive battery flow spot-check is still required before pilot use
  unless a later checkpoint records it as verified.

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
- Trigger-safe pouch/cyl stack insert order: `A1, C1, A2, C2`, preserving original `position_index`.
- Migration ledger creation in `d032_create_schema_migrations_table.sql`;
  current migration files exist through Dima `020` and Dalia `d032`, with 41
  SQL files in both `migrations/` and `migrations_ASCII/`.
- Vanilla smoke harness now applies the post-dump migrations needed for the
  current restored-copy schema, including `002`, `018`, `019`, `020`, and
  `d028` through `d032`.
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

## Last Verified Checkpoint

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

Migration ledger checkpoint verified on 2026-05-09:

- `node --check scripts/smoke_vanilla_api.js` passed.
- Local `badb_app_v1` has authoritative `schema_migrations` rows from `d032`
  with `dima = 21` and `dalia = 20`.
- `npm run smoke:vanilla` passed: 241 checks, 0 failures. The smoke harness
  restored the old dump and applied `002`, `018`, `019`, `020`, and `d028`
  through `d032`.

Current release-check commands:

```bash
git diff --check
npm test
npm run contract:vanilla
npm run smoke:vanilla
```

## Must Verify Before Pilot

- Full smoke test passes on a faithful restored copy of the pilot-target
  database. Local restored-copy smoke passed on 2026-05-09; the smoke harness
  must not be pointed at the live Windows/lab database.
- Windows/lab database proof: the Windows production/pilot DB has
  `public.schema_migrations` counts of `dima = 21` and `dalia = 20`; then the
  `d031` verification query from `docs/instructions/apply_migrations.md`
  returns the expected values.
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
  - cylindrical;
  - disassembled battery with no saved stack rows;
  - cathode-first valid payload for pouch/cyl.
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
