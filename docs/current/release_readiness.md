# BADB Release Readiness

Created: 2026-05-06
Edited: 2026-05-08
Status: current

This file tracks only the current release-control state. Do not use it for future ideas, long worklogs, or archived rationale.

## Current Target

Internal lab pilot / v1 usable release.

## Current Source Of Truth

1. Code in `BADB_main/`.
2. SQL migrations in `migrations/`.
3. Automated checks and smoke tests.
4. Current working docs in `docs/current/`, `docs/rules/`, and `docs/instructions/`.
5. Formal mirror in `Документация ЕСПД/`.

Archived notes and generated materials are historical context only.

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
- Vanilla smoke harness now applies `d031` after restoring the old dump.
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
- `npm run smoke:vanilla` passed: 233 checks, 0 failures. The smoke harness
  restored the old dump and applied `d028`, `d029`, `d030`, and `d031`.
- Manual spot checks found the current UI usable; exact destructive battery
  delete and Windows/lab DB checks remain listed below until explicitly
  verified.

## Must Verify Before Pilot

- Full smoke test passes on the pilot-target database or a faithful restored
  copy. Local restored-copy smoke passed on 2026-05-08.
- `d031` is applied to the Windows production/pilot DB before pilot use.
- Guided battery delete is manually tested for:
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
