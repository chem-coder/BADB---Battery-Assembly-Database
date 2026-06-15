# Operator vs Creator — schema convention

Status: **frontend-ready, backend pending**

## Problem

Lab workflows have two distinct people per record:

1. **Оператор** — who physically performed the work (cut the electrodes,
   mixed the slurry, assembled the cell).
2. **Заполнил** — who typed the data into the system. Sometimes this is
   the operator themselves; sometimes it's an assistant logging on
   their behalf after the fact.

Until now both were conflated in `created_by` on every parent table.
This loses operator information whenever someone else does the data
entry.

## Convention

| Field | Semantic | Set by | Editable |
|---|---|---|---|
| `created_by`, `updated_by` (existing) | **Audit** — who entered / last modified the row | Backend, from JWT | Never |
| `operator_user_id` (NEW) | **Business** — who did the physical work | User picks in the form | Yes |

Both columns reference `users(user_id)`.

For workflow STEPS (drying, mixing, weighing, etc.) `performed_by` is
already on each step's table — that stays. The new column is only for
the parent entity (the batch / tape / battery itself).

## Tables that need the new column

| Table | Note |
|---|---|
| `electrode_cut_batches` | Cutting operator |
| `tapes` | Tape preparation operator (parent-level; per-step performed_by stays) |
| `batteries` | Assembly operator |

Other tables (recipes, materials, projects, etc.) describe artefacts,
not work events, and do not need an operator column.

## Suggested migration

`migrations/dXXX_add_operator_user_id.sql`:

```sql
BEGIN;

ALTER TABLE electrode_cut_batches
  ADD COLUMN IF NOT EXISTS operator_user_id INTEGER REFERENCES users(user_id);

ALTER TABLE tapes
  ADD COLUMN IF NOT EXISTS operator_user_id INTEGER REFERENCES users(user_id);

ALTER TABLE batteries
  ADD COLUMN IF NOT EXISTS operator_user_id INTEGER REFERENCES users(user_id);

CREATE INDEX IF NOT EXISTS idx_electrode_cut_batches_operator
  ON electrode_cut_batches(operator_user_id);
CREATE INDEX IF NOT EXISTS idx_tapes_operator
  ON tapes(operator_user_id);
CREATE INDEX IF NOT EXISTS idx_batteries_operator
  ON batteries(operator_user_id);

COMMIT;
```

`NULLABLE` is intentional — pre-existing rows have no recorded operator,
and the column should treat NULL as "operator unknown / same as
creator". The reports layer can fall back to `created_by` when
`operator_user_id IS NULL`.

## Backend changes needed (Dalia)

Per affected table:

1. Accept `operator_user_id` in POST and PUT bodies. Validate it
   references a real user. Allow NULL.
2. Persist it via the INSERT/UPDATE statement that already exists in
   `services/tapeCatalogService.js`, `services/batteryCatalogService.js`,
   and the electrode cut-batch service.
3. Return `operator_user_id` AND `operator_user_name` (join on users)
   from GET handlers so the frontend can show it in lists and the
   opened-record header.
4. Add an audit row in `field_changelog` if the operator changes,
   keyed by `operator_user_id` — same pattern as other audited fields.

## Frontend wiring (already in place)

- `BatchCreateDialog.vue` has a separate **"Оператор"** Select next to
  the read-only **"Заполнил"** card; it forwards `operator_user_id` in
  the POST payload.
- `EntityMeta.vue` labels the audit footer **"Заполнил"** / **"Изменил"**
  so users don't read it as "the operator".
- Once Dalia ships the column, the frontend will see and display
  `operator_user_name` in the opened-record header.

## Open questions

- Should an admin be allowed to change `operator_user_id` after the
  fact? (Probably yes, with a `field_changelog` audit row.)
- Default operator: current user, or "unknown" until set? (Current user
  is more pragmatic — most data entry is self-logged.)
- Reports: "production by operator" filtering on `operator_user_id`
  (with `created_by` fallback for legacy rows).
