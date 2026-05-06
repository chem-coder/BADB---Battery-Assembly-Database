# BADB Release Readiness

Created: 2026-05-06
Edited: 2026-05-06
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
- Battery stack DB trigger hardening in `d031_harden_battery_stack_validate_trigger.sql`.
- Trigger-safe pouch/cyl stack insert order: `A1, C1, A2, C2`, preserving original `position_index`.
- Vanilla smoke harness now applies `d031` after restoring the old dump.
- Battery/electrode/materials/capacity/runbook docs were compressed into the canonical docs system.
- Formal `Документация ЕСПД/` mirror was updated from the canonical docs.

## Last Verified Checkpoint

Verified on 2026-05-06:

- `node --check` on changed backend and vanilla JS files.
- `git diff --check`.
- `npm test` passed: 26 tests.
- `npm run contract:vanilla` passed.
- `npm run smoke:vanilla` passed: 224 checks, 0 failures.
- Canonical/formal docs link check passed.

## Must Verify Before Pilot

- Full smoke test passes on the pilot-target database or a faithful restored copy.
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
  - cathode-first valid payload for pouch/cyl.
- Existing battery print report opens and loads data with an authenticated session.
- Electrolytes page is checked after the current branch work is finished.

## Do Not Start Before Pilot Unless Blocking

- Large UI redesign.
- New schema expansions.
- New feature families.
- Broad documentation cleanup beyond keeping current docs accurate.
- Refactors that are not required for release safety.

## Update Rule

Update this file only when release readiness changes: a required check passes/fails, a blocker is found, a blocker is removed, or the target changes.
