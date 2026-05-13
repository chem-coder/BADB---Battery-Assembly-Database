# BADB Migrations

Forward-only SQL migrations applied in alphabetical order to
`badb_app_v1` (Dalia's PostgreSQL database).

Current migration file state as of 2026-05-13:

- `migrations/` has 42 SQL files.
- `migrations_ASCII/` has 42 SQL files.
- Dima's numeric stream exists through `020_cycling_active_mass.sql`.
- Dalia's `dNNN` stream exists through `d033_add_coating_side2_gap_and_drying_speed.sql`.
- Live local `badb_app_v1` has authoritative `public.schema_migrations`
  counts of `dima = 21` and `dalia = 21` after `d033` is applied.

## How to apply

No automated runner exists yet — migrations are applied manually from
`BADB_main`, not the outer `RENERA` workspace:

```bash
for f in migrations/*.sql; do
  echo "Applying $(basename $f)..."
  psql -U Dalia -d badb_app_v1 -f "$f"
done
```

Every migration uses `IF NOT EXISTS` / `IF EXISTS` guards where
possible, so re-running is safe — already-applied steps are no-ops.

Migration application is recorded in `public.schema_migrations`, the
authoritative migration ledger, starting with
`d032_create_schema_migrations_table.sql`. Historical rows before `d032`
are a baseline: they prove the database was brought to the current
migration set before the ledger was created, but their exact original
application timestamps are unknown.

The flat `migrations_log.txt` files are human checkpoint notes only. They are
useful release breadcrumbs, but they are not authoritative for any target
database.

The `migrations_ASCII/` folder is a functionally equivalent ASCII-safe
mirror for Windows/encoding-sensitive use. Mirror files do not need to
be byte-identical copies, but they must produce the same schema/data
effects; use ASCII-safe SQL forms such as PostgreSQL Unicode escapes for
non-ASCII stored values instead of changing migration behavior.

## Naming convention — two namespaces

Two developers work on this DB in parallel; each uses its own numeric
namespace so migrations never collide:

| Namespace         | Who   | Pattern                                      |
| ----------------- | ----- | -------------------------------------------- |
| `NNN_*.sql`       | Dima  | Plain 3-digit counter (`001_*` … `020_*`)    |
| `dNNN_*.sql`      | Dalia | Prefixed with `d` (`d013_*` … `d033_*`)      |

Alphabetical ordering of `ls migrations/` gives:

```
001 → 002 → … → 020   (Dima's migrations run first)
d013 → d014 → …       (Dalia's migrations run after)
```

Dalia's `d` prefix sorts after all numeric-only names. This is
deliberate — Dalia's migrations (added after her fork started in
March 2026) are expected to rely on everything Dima's base set
established, so they run last.

**Rule:** never rename or move a migration that is already in `main`.
If you need to correct a past migration, create a new forward-only
migration that patches it.

## Invariants

- **Forward-only.** No `DROP TABLE`, no destructive `ALTER`, no data
  deletes beyond one-off cleanups. A column drop goes through an
  explicit "deprecate in place, drop next quarter" migration.
- **Idempotent.** `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT
  EXISTS`, `DROP … IF EXISTS` — so that re-running the whole folder
  on a fresh or partially-migrated DB doesn't fail.
- **Append-only log tables** (`raw_submissions`, `auth_log`,
  `field_changelog`) must not be ALTERed in ways that rewrite history.
  Only add columns.
- **Never edit an existing migration file.** Once a migration is
  committed to `main`, any change goes into a new file.

## History summary

Full timeline is in the git log. High-level:

- `001_auth_tables` → `007_fix_user_roles` — initial auth/permissions
  schema (Dima, March 2026).
- `008_*` — two independent migrations with the same `008` prefix
  landed at the same time (`simplify_coin_layout_and_electrolyte` +
  `tapes_nullable_project_recipe`). Both are safe to apply; the
  duplicate prefix is historical and kept for git-blame continuity.
- `009_add_token_version` — JWT revocation support (Dima, April 2026).
- `010_departments` → `012_activity_log` — org structure + audit
  log (Dima, April 2026).
- `013_traceability` — per-field change log across CRUD routes (Dima).
- `014_feedback` — replaces the legacy "Журнал подач" page.
- `015_cycling` — cycling_sessions / cycling_datapoints /
  cycling_cycle_summary tables (Dima).
- `016_project_department_access` + `017_access_expires_at` —
  bulk access grants + expiry (Dima, April 2026).
- `018_department_real_names_and_assignments` — placeholder names
  replaced with the real 4-department org chart; 15 user reassignments.
  `department_id` FK values preserved — only `name` column and
  `users.department_id` changed (Dima, April 2026).
- `019_cycling_summary_extra_metrics` — adds `energy_efficiency`,
  `avg_charge_voltage_v`, `avg_discharge_voltage_v` to
  `cycling_cycle_summary` for publication-grade plots (Dima, April 2026).
- `020_cycling_active_mass` — adds `active_mass_mg` to
  `cycling_sessions` for mAh/g specific-capacity plots (Dima, April 2026).
- `d013` … `d031` — Dalia's parallel stream: `updated_at` triggers,
  form-factor cascades, tape workflow refinements, dry-box tracking,
  coating sidedness, material source/property attachments, many-to-many
  project links, and battery stack trigger hardening (March-May 2026).
- `d031_harden_battery_stack_validate_trigger` — current local
  `badb_app_v1` has this applied. It updates
  `validate_battery_stack()` so pouch/cylindrical stacks allow equal
  cathode/anode counts or one extra anode, but not one extra cathode.
- `d032_create_schema_migrations_table` — creates
  `public.schema_migrations`, verifies key current migration effects,
  and records the current migration baseline. The vanilla smoke harness
  also applies current post-dump migrations automatically to its
  throwaway database because the restored dump predates them.
- `d033_add_coating_side2_gap_and_drying_speed` — adds `gap_um_side2`
  to `tape_step_coating` and `drying_speed_text` to `tape_step_drying`
  for the current lab coating/drying workflow.

## Check migration ledger

Current databases should have a `public.schema_migrations` row for every
SQL migration in `migrations/`:

```bash
psql -d badb_app_v1 -c "SELECT migration_stream, count(*) FROM schema_migrations GROUP BY migration_stream ORDER BY migration_stream;"
psql -d badb_app_v1 -c "SELECT migration_name, applied_at, source FROM schema_migrations ORDER BY migration_name;"
```

Rows with `source = 'd032_baseline'` are historical backfill rows.
Future migrations should insert their own row with a real `applied_at`
as part of the migration file.

Expected stream counts for a current migrated database:

```text
dalia = 21
dima = 21
```

Dima has 21 rows even though the numeric stream is through `020` because two
independent historical migrations use the `008_*.sql` prefix.

## When you open a PR

If your branch adds new migrations, list them in the PR description
so the reviewer can apply them on their side before testing:

```
New migrations (run after pulling):
  psql -U Dalia -d badb_app_v1 -f migrations/020_cycling_active_mass.sql
  psql -U Dalia -d badb_app_v1 -f migrations/021_your_next_one.sql
```

`IF NOT EXISTS` guards mean the reviewer can safely apply them in any
order relative to their own local WIP migrations, as long as both
developers respect the namespace rule (Dima uses numeric prefixes,
Dalia uses `d` prefix).
