# Frontend Parity Handoff

Created: 2026-05-07
Edited: 2026-05-08
Status: instruction

Use this when vanilla/backend behavior changes and the Vue frontend maintained
by Dima/Claude may need matching behavior.

## Purpose

The Vue frontend must not guess critical behavior from scattered future notes.
When Dalia changes the vanilla app, backend rules, migrations, or release
behavior, record whether Vue needs parity in one place.

## Source Order

Use this order when deciding expected Vue behavior:

1. implemented backend/API behavior;
2. implemented vanilla behavior;
3. `docs/current/`;
4. `docs/rules/`;
5. this handoff document;
6. `docs/future/` only for explicitly future work.

Archived/generated material is not source of truth.

## When To Add A Parity Item

Add an item when a change affects:

- user-facing workflow behavior;
- status/state rules;
- delete/disassembly safety;
- validation or DB-trigger assumptions;
- print/report behavior;
- upload or file lifecycle;
- release-blocking checks.

Do not add an item for a purely internal vanilla refactor unless Vue must copy a
visible behavior or shared rule.

## Item Format

Use this compact format:

```md
### Short Item Name

Status: pending | in progress | done | not needed
Priority: release blocker | high | normal | later
Source: `path/to/source-file`
Expected Vue behavior:
Backend/API dependency:
Notes:
```

When Vue catches up, change `Status:` to `done` and add the commit or PR if
known. If review shows Vue does not need the behavior, change `Status:` to
`not needed` and explain why.

## Pending Vue Parity

### Battery Status Workflow

Status: pending
Priority: high
Source: `docs/current/batteries.md`, `docs/rules/battery_lifecycle_rules.md`
Expected Vue behavior: display blank/`NULL` and legacy `disassembled` as
`Открыт`; do not allow users to select `Открыт`; allow `Собран`,
`На тестировании`, `Завершён`, and `Брак` only after required assembly records
exist.
Backend/API dependency: `PATCH /api/batteries/:id` rejects nonselectable or
premature statuses.
Notes: Vue must not reintroduce read-time status mutation.

### Guided Battery Delete Safety

Status: pending
Priority: high
Source: `docs/rules/battery_lifecycle_rules.md`
Expected Vue behavior: if Vue exposes battery delete, it must use backend
delete-check, show hard blockers before typed confirmation, preserve auth-only
access, and support electrode return/scrap choices exactly as the backend
expects.
Backend/API dependency: `GET /api/batteries/:id/delete-check` and
`DELETE /api/batteries/:id`.
Notes: Cycling sessions and module links are hard blockers.

### Battery Stack Save Safety

Status: pending
Priority: high
Source: `docs/rules/electrode_stack_rules.md`
Expected Vue behavior: if Vue saves battery stacks, pouch/cyl rows must be sent
or inserted in trigger-safe paired order while preserving original
`position_index`.
Backend/API dependency: `d031_harden_battery_stack_validate_trigger.sql`.
Notes: The vanilla service already handles trigger-safe ordering.

### Electrolyte Reference Page Reports And Filters

Status: pending
Priority: normal
Source: `docs/current/electrolytes.md`
Expected Vue behavior: if Vue owns an electrolytes page, mirror the current
filter and print-report expectations where relevant.
Backend/API dependency: electrolyte list/detail/report routes.
Notes: Verify current Vue scope before implementing.

### Separator Reference Page Reports And Filters

Status: pending
Priority: normal
Source: `docs/current/separators.md`
Expected Vue behavior: if Vue owns a separators page, mirror the current
row-open, status/structure/text filters, inside-record delete, and print-report
expectations where relevant. Do not add project filters unless separator project
links are actually implemented.
Backend/API dependency: `GET /api/separators/:id/report` and
`GET /api/separators/:id/delete-check`.
Notes: Current Vue scope should be checked before implementation.

### Project Access Terminology

Status: pending
Priority: normal
Source: `docs/instructions/vanilla_ui_patterns.md`
Expected Vue behavior: project access/confidentiality labels should use
`Доступ`, `Все уровни доступа`, `для всех`, `для отдела`, and
`выборочный доступ`. Do not show `Видимость` or `публичный` for this UI.
Backend/API dependency: internal values may remain `public`, `department`, and
`confidential`.
Notes: This is terminology parity, not a schema or permission change.

## Maintenance Rules

- Keep this file short.
- Remove or close stale parity items quickly.
- Do not duplicate full feature specs here; link to current/rule docs.
- Do not use `docs/future/` as a substitute for parity tracking.
