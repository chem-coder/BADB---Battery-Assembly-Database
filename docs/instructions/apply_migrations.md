# Apply Migrations

Created: 2026-05-06
Edited: 2026-05-19
Status: instruction
Verified against code: 2026-05-19
Source paths: `migrations/README.md`, `migrations/`, `migrations_ASCII/`, `migrations/migrations_log.txt`, `migrations_ASCII/migrations_log.txt`, `scripts/smoke_vanilla_api.js`

BADB migrations are manual, forward-only SQL files.

`public.schema_migrations` is the authoritative applied-migration ledger
starting with `d032_create_schema_migrations_table.sql`. Older rows were
backfilled by `d032`; future migration files should insert their own row.
The flat `migrations_log.txt` files are human checkpoint notes only.

Current migration file state as of 2026-05-19:

- `migrations/` has 47 SQL files.
- `migrations_ASCII/` has 47 SQL files.
- Dima's numeric stream exists through `020_cycling_active_mass.sql`.
- Dalia's `dNNN` stream exists through `d038_add_electrode_capacity_average_flag.sql`.
- Live local `badb_app_v1` has `schema_migrations` counts of `dima = 21`
  and `dalia = 26` after `d038` is applied. Dima has 21 rows because the
  historical numeric stream includes two independent `008_*.sql` files.

## Source Folders

Use both migration folders:

- `migrations/` is the main migration folder.
- `migrations_ASCII/` is the ASCII-safe mirror for Windows/encoding-sensitive use.

When adding a migration, keep both folders in sync and update both migration logs:

- `migrations/migrations_log.txt`
- `migrations_ASCII/migrations_log.txt`

The logs should summarize the human checkpoint. Do not use them as the source
of truth for a target database; query `public.schema_migrations`.

Do not rename, rewrite, or reorder a migration that has already landed in `main`.

## Numbering Streams

The current convention from `migrations/README.md`:

- numeric `NNN_*` migrations belong to Dima's stream;
- `dNNN_*` migrations belong to Dalia's stream.

Use the next file in the correct stream, then document what was applied.

## Current Order

Apply migrations from `BADB_main` in alphabetical file order unless a release
note gives a smaller explicit post-dump set:

```text
001_... through 020_...
d013_... through d038_add_electrode_capacity_average_flag.sql
```

The current vanilla smoke restored-copy path applies only the migrations missing
from the old smoke dump:

```text
002_raw_submissions.sql
018_department_real_names_and_assignments.sql
019_cycling_summary_extra_metrics.sql
020_cycling_active_mass.sql
d028_tape_projects_many_to_many.sql
d029_electrode_cut_batch_projects_many_to_many.sql
d030_battery_projects_many_to_many.sql
d031_harden_battery_stack_validate_trigger.sql
d032_create_schema_migrations_table.sql
d033_add_coating_side2_gap_and_drying_speed.sql
d034_update_wet_mixing_methods.sql
d035_add_item_created_at_dates.sql
d036_add_prism_form_factor.sql
d037_add_viscosity_conditions.sql
d038_add_electrode_capacity_average_flag.sql
```

Do not treat a local smoke pass as proof that the Windows/lab database has these
migrations. The Windows/lab database must be checked directly.

## Apply One Migration

From `BADB_main` (not the outer `RENERA` workspace), apply explicit migration
files:

```bash
psql -d badb_app_v1 -v ON_ERROR_STOP=1 -f migrations/d031_harden_battery_stack_validate_trigger.sql
```

If a specific database user is needed:

```bash
psql -U Dalia -d badb_app_v1 -v ON_ERROR_STOP=1 -f migrations/d031_harden_battery_stack_validate_trigger.sql
```

On Windows/PowerShell with env vars:

```powershell
psql -U $env:DB_USER -d $env:DB_NAME -v ON_ERROR_STOP=1 -f migrations_ASCII/d031_harden_battery_stack_validate_trigger.sql
```

For pilot use, `d031_harden_battery_stack_validate_trigger.sql` is mandatory on
the Windows/lab database, and `d032_create_schema_migrations_table.sql` must
record the current ledger baseline. Apply the ASCII mirror on Windows unless
the UTF-8 main migrations have already been applied and verified.

## Fresh Or Restored Database

For a fresh database or a restored older dump, apply the needed migrations in order. Prefer explicit filenames for release work so the evidence is clear.

The vanilla smoke harness restores the old dump into a throwaway database and then applies its post-dump migrations automatically. Current post-dump smoke migrations are:

- `migrations/002_raw_submissions.sql`
- `migrations/018_department_real_names_and_assignments.sql`
- `migrations/019_cycling_summary_extra_metrics.sql`
- `migrations/020_cycling_active_mass.sql`
- `migrations/d028_tape_projects_many_to_many.sql`
- `migrations/d029_electrode_cut_batch_projects_many_to_many.sql`
- `migrations/d030_battery_projects_many_to_many.sql`
- `migrations/d031_harden_battery_stack_validate_trigger.sql`
- `migrations/d032_create_schema_migrations_table.sql`
- `migrations/d033_add_coating_side2_gap_and_drying_speed.sql`
- `migrations/d034_update_wet_mixing_methods.sql`
- `migrations/d035_add_item_created_at_dates.sql`
- `migrations/d036_add_prism_form_factor.sql`
- `migrations/d037_add_viscosity_conditions.sql`
- `migrations/d038_add_electrode_capacity_average_flag.sql`

This is the expected migration set for the current smoke harness. If a future
branch adds a post-dump migration, update `scripts/smoke_vanilla_api.js` and
this document together.

## Check Migration Ledger

Check whether the ledger exists and which migrations it records:

```bash
psql -d badb_app_v1 -c "SELECT migration_stream, count(*) FROM schema_migrations GROUP BY migration_stream ORDER BY migration_stream;"
psql -d badb_app_v1 -c "SELECT migration_name, applied_at, source FROM schema_migrations ORDER BY migration_name;"
```

Expected after `d038`:

```text
dalia: 26 rows
dima: 21 rows
```

Rows with `source = 'd032_baseline'` were backfilled because those migrations
predate the ledger. New migrations should insert their own ledger row.

## Check d031 Battery Stack Trigger

`d031_harden_battery_stack_validate_trigger.sql` hardens `validate_battery_stack()`;
`d036_add_prism_form_factor.sql` extends the same rule to prism. Current
pouch/prism/cylindrical stacks allow equal anode/cathode counts or one extra
anode, never one extra cathode. The function also handles updates.

Check the current database:

```bash
psql -d badb_app_v1 -c "
SELECT
  (position('anode_count = cathode_count + 1' in pg_get_functiondef('public.validate_battery_stack()'::regprocedure)) > 0) AS allows_extra_anode,
  (position('cathode_count = anode_count + 1' in pg_get_functiondef('public.validate_battery_stack()'::regprocedure)) > 0) AS allows_extra_cathode,
  (position('TG_OP = ''UPDATE''' in pg_get_functiondef('public.validate_battery_stack()'::regprocedure)) > 0) AS handles_update;
"
```

Expected for a current database:

```text
allows_extra_anode = true
allows_extra_cathode = false
handles_update = true
```

For Windows/lab release evidence, record the database name, the command used,
the `schema_migrations` stream counts, and the three expected boolean values.
The lab database is not considered ready for pilot use until the ledger proves
the current migration baseline and this check proves `d031` is present.

As of 2026-05-19, the flat checkpoint logs note Dima's stream through `020`
and Dalia's stream through `d038`; `public.schema_migrations` remains the
authoritative ledger.
