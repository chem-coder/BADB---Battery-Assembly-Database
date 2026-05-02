---
paths:
  - "migrations/**"
---

# Migrations — invariants when working in `migrations/`

## Forward-only

- **Never DROP TABLE.** If a table is no longer needed, leave it; mark it stale via comment in the schema.
- **Never destructive ALTER** on an existing table that holds production data (no `DROP COLUMN` of a column with values, no `ALTER TYPE` that loses data).
- Schema rollback is done via a new "compensating" migration — never by editing or removing an old one.

## Append-only journals (NEVER write UPDATE / DELETE on these)

- `raw_submissions` — Excel/API/import payloads, full history must remain intact.
- `auth_log` — login/logout/password events; security audit source of truth.
- `field_changelog` — per-field diffs of CRUD operations.

If a row in one of these tables is "wrong", do not delete or update — write a corrective row instead and let analytics filter on `created_at`.

## Naming convention

Current pattern (as of 2026-04-30, after migration `d030`):

```
migrations/
├── 001_initial.sql
├── ...
├── d013_<description>.sql        ← Dalia's prefix `d` for migrations she authored
├── d025_<description>.sql
├── d028_tape_projects.sql        ← M2M relations (tapes ↔ projects)
├── d029_electrode_cut_batch_projects.sql
└── d030_battery_projects.sql
```

Use the next sequential number with the `d` prefix when you author a migration. Description in lowercase, words separated by `_`.

## File structure

```sql
-- migrations/dXXX_<description>.sql
-- Author: <name>
-- Date: YYYY-MM-DD
-- Purpose: <one-line summary>

BEGIN;

-- 1. Table changes
CREATE TABLE IF NOT EXISTS ...

-- 2. Indexes
CREATE INDEX IF NOT EXISTS ...

-- 3. Data backfill (if any)
INSERT INTO ... ON CONFLICT DO NOTHING;

COMMIT;
```

`BEGIN; ... COMMIT;` is mandatory — partial application leaves the schema inconsistent.

## Existing migrations are immutable

The pre-commit hook in CLAUDE.md (top-level) blocks any modification to existing files in `migrations/`. If a migration has a bug, write a new compensating migration; do not edit the original. This is enforced by:

```bash
MODIFIED_MIGRATIONS=$(git diff --cached --name-only --diff-filter=M -- migrations/)
```

## How migrations are applied

Manually, in order, by the system administrator. There is no automated runner. See Doc 05 «Руководство системного программиста» §3.1 for the procedure (`psql -f migrations/dXXX.sql`). The journal of applied migrations is `migrations/migrations_log.txt`.

## M2M relation pattern (use as template)

For a new "many-to-many" relation between an entity and `projects`, follow the existing pattern from `d028`:

```sql
CREATE TABLE IF NOT EXISTS <entity>_projects (
  <entity>_id  INTEGER NOT NULL REFERENCES <entity>(<entity>_id) ON DELETE CASCADE,
  project_id   INTEGER NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  created_by   INTEGER REFERENCES users(user_id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (<entity>_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_<entity>_projects_project_id
  ON <entity>_projects(project_id);
```

Do NOT remove the original `<entity>.project_id` column when introducing M2M — it stays as the "originating" project for backward compatibility, and the M2M table is the extended list.

## After authoring a migration

1. Apply locally: `psql -d badb_app_v1 -f migrations/dXXX_*.sql`.
2. Verify: `psql -d badb_app_v1 -c "\d <new_table>"`.
3. Append to `migrations/migrations_log.txt`: `dXXX_<desc>.sql — applied YYYY-MM-DD by <user>`.
4. If the migration changes the schema in a way that affects ERD or table count: update Doc 03 «Пояснительная записка» §3.4 and §3.5.1, and Doc 02 «Описание программы» §3.2.6 (migration range).
5. If the migration adds/changes endpoints behaviour: update Doc 02 Appendix A.
