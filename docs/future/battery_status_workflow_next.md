# Battery Status Workflow Next

Created: 2026-05-07
Edited: 2026-05-09
Status: future idea
Verified against current docs/code: cleanup pass 2026-05-09

Current source of truth:

- `docs/current/batteries.md`
- `docs/rules/battery_lifecycle_rules.md`
- `docs/instructions/frontend_parity_handoff.md`
- `public/js/3-batteries.js`
- `routes/batteries.js`
- `services/batteryAssemblyService.js`
- `services/batteryCatalogService.js`
- `services/batteryLifecycleService.js`

The core battery status workflow and simple Batteries list filters are current
behavior. This document tracks only follow-up work that remains future.

## Current Behavior Pointer

Do not reimplement the status model from this future note. Current behavior is
documented in `docs/current/batteries.md`:

- blank/`NULL` and legacy `disassembled` display as derived `Открыт`;
- `Открыт` is not user-selectable;
- post-assembly selectable statuses are `Собран`, `На тестировании`,
  `Завершён`, and `Брак`;
- ordinary read/report endpoints do not promote status on fetch;
- current list filters are client-side text, derived status, and form factor.

Vue parity for the current status behavior is tracked in
`docs/instructions/frontend_parity_handoff.md`.

## Rework Or Reopen Action

If an assembled, testing, completed, or failed battery needs rework, that should
be a deliberate action, not a casual dropdown selection.

Possible action labels:

- `Переоткрыть`;
- `Редактировать собранную запись`.

The exact UI label can be decided during implementation. The important rule is
that reopening/rework should be explicit and auditable.

## Advanced List Filters

The current Batteries page already has simple client-side filters. Additional
filters remain future work only if the current list becomes hard to scan.

Possible future filters:

- project multi-select;
- date range;
- operator/creator;
- backend/list-query filtering for large datasets.

Keep any first pass page-local unless the dataset size proves backend filtering
is needed.

## Old Data Cleanup

Ordinary read/report endpoints no longer rewrite status. If old complete
records still have blank/`NULL` or `disassembled` status, handle them later with
an explicit migration, maintenance command, or deliberate cleanup pass.

## Guardrails

- Do not add a new status schema unless the existing column cannot support the
  workflow safely.
- Do not make `Открыт` user-selectable.
- Do not let a read-only fetch endpoint mutate status.
- Keep disassembly/delete semantics separate: delete is for mistaken DB
  records; disassembly/rework is lifecycle behavior.
