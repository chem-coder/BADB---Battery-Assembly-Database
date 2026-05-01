# BADB Migrations

Forward-only SQL migrations applied in alphabetical order to
`badb_app_v1` (Dalia's PostgreSQL database).

## How to apply

No automated runner exists yet — migrations are applied manually:

```bash
# From repo root:
for f in migrations/*.sql; do
  echo "Applying $(basename $f)..."
  psql -U Dalia -d badb_app_v1 -f "$f"
done
```

Every migration uses `IF NOT EXISTS` / `IF EXISTS` guards where
possible, so re-running is safe — already-applied steps are no-ops.

## Naming convention — two namespaces

Two developers work on this DB in parallel; each uses its own numeric
namespace so migrations never collide:

| Namespace         | Who   | Pattern                                      |
| ----------------- | ----- | -------------------------------------------- |
| `NNN_*.sql`       | Dima  | Plain 3-digit counter (`001_*` … `020_*`)    |
| `dNNN_*.sql`      | Dalia | Prefixed with `d` (`d013_*` … `d023_*`)      |

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
- `d013` … `d023` — Dalia's parallel stream: `updated_at` triggers,
  form-factor cascades, tape workflow refinements, dry-box tracking
  (March–April 2026).

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
