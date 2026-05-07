# Battery Status Workflow Next

Created: 2026-05-07
Edited: 2026-05-07
Status: partially implemented
Verified against code: status workflow implemented 2026-05-07; remaining future work listed below

Source paths to inspect before implementation:

- `public/js/3-batteries.js`
- `routes/batteries.js`
- `services/batteryAssemblyService.js`
- `services/batteryCatalogService.js`
- `services/batteryLifecycleService.js`
- `docs/current/batteries.md`
- `docs/rules/battery_lifecycle_rules.md`

This document records the battery status decision and remaining follow-up work.
The core status workflow below was implemented on 2026-05-07; rework/reopen
actions, list filters, and any explicit old-data cleanup pass remain future
work.

## Target Status Model

Use the existing `batteries.status` column if possible. No schema change is
expected for this pass.

Target statuses:

- blank/`NULL`: system-derived `Открыт`
- `assembled`: `Собран`
- `testing`: `На тестировании`
- `completed`: `Завершён`
- `failed`: `Брак`

The old persistent `disassembled` status should stop being treated as a normal
current-status choice. Disassembly should be an event/action recorded in history,
not a long-term status label that competes with `Открыт`.

## Assembly Completeness

A battery is assembly-complete when the required assembly records exist:

- form-factor config;
- electrode sources;
- saved electrode stack;
- separator config;
- electrolyte config.

QC and electrochemistry are not required for `Собран`.

## Dropdown Rule

Before assembly-complete:

- the status control displays `Открыт`;
- the status control is disabled;
- the user cannot choose another status.

After assembly-complete:

- the app auto-sets status to `Собран` when the final required section is saved;
- the status control becomes editable;
- the user can choose only:
  - `Собран`;
  - `На тестировании`;
  - `Завершён`;
  - `Брак`.

The user must not manually choose `Открыт` from the dropdown. `Открыт` is a
system-derived editable/incomplete state, not a user-selected lifecycle outcome.

## No Hidden Write On Read

Do not change battery status just because a record was opened or fetched.

If old records already contain enough assembly data but still have blank status,
handle that with an explicit migration, maintenance command, or deliberate
cleanup pass. Ordinary read/report endpoints should not silently rewrite status.

## Rework

If an assembled, testing, completed, or failed battery needs rework, that should
be a deliberate action, not a casual dropdown selection.

Possible action labels:

- `Переоткрыть`;
- `Редактировать собранную запись`.

The exact UI label can be decided during implementation. The important rule is
that reopening/rework should be explicit and auditable.

Status as of 2026-05-07: not implemented in this cleanup pass.

## List Filters

The Batteries page needs top-of-list filters so users can find records without
misusing status values.

Minimum useful filters:

- status;
- project;
- form factor;
- text search by battery id/notes/material labels where practical.

Status filtering should include the derived `Открыт` state.

Status as of 2026-05-07: not implemented in this cleanup pass.

## Old Data Cleanup

Ordinary read/report endpoints no longer rewrite status. If old complete records
still have blank/`NULL` or `disassembled` status, handle them later with an
explicit migration, maintenance command, or deliberate cleanup pass.

## Implementation Guardrails

- Do not add a new status schema unless the existing column cannot support the
  workflow safely.
- Do not make `Открыт` user-selectable.
- Do not let a read-only fetch endpoint mutate status.
- Keep disassembly/delete semantics separate: delete is for mistaken DB records;
  disassembly/rework is lifecycle behavior.
- Update current docs only after the behavior is implemented and verified.
