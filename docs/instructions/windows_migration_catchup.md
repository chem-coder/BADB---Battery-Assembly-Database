# Windows Migration Catch-Up

Created: 2026-05-09
Edited: 2026-05-19
Status: instruction
Source paths: `migrations_ASCII/`, `migrations/README.md`, `docs/instructions/apply_migrations.md`, `/Users/Dalia/Developer/RENERA/BADB_WINDOWS_MIGRATION_CATCHUP_NOTE.md`

This instruction is for bringing the Windows/lab BADB database up to the
current migration state after pulling the latest `main`.

Run commands from `BADB_main`, not the outer `RENERA` workspace.

## Current Migration State

- `migrations/` has 47 SQL files.
- `migrations_ASCII/` has 47 SQL files.
- Dima's numeric stream exists through `020_cycling_active_mass.sql`.
- Dalia's `dNNN` stream exists through `d038_add_electrode_capacity_average_flag.sql`.
- Current local `badb_app_v1` has `public.schema_migrations` counts of
  `dima = 21` and `dalia = 26` after `d038` is applied.

`public.schema_migrations` is the authoritative applied-migration ledger. The
flat `migrations_log.txt` files are human checkpoint notes only.

## Main Point

Do not run `d032_create_schema_migrations_table.sql` first on an unknown or
possibly stale Windows/lab database.

`d032` creates the `schema_migrations` ledger table, but it also checks that
important earlier migrations are already present. If the Windows/lab database
is missing one of those expected schema changes, `d032` fails on purpose instead
of recording a false current baseline. That failure is protective.

## Catch-Up Order

After pulling the latest `main`, run the ASCII mirror migrations from
`BADB_main`:

```powershell
cd C:\path\to\BADB_main
$env:DB_USER = "postgres"
$env:DB_NAME = "badb_app_v1"

psql -U $env:DB_USER -d $env:DB_NAME -v ON_ERROR_STOP=1 -f migrations_ASCII/002_raw_submissions.sql
psql -U $env:DB_USER -d $env:DB_NAME -v ON_ERROR_STOP=1 -f migrations_ASCII/018_department_real_names_and_assignments.sql
psql -U $env:DB_USER -d $env:DB_NAME -v ON_ERROR_STOP=1 -f migrations_ASCII/019_cycling_summary_extra_metrics.sql
psql -U $env:DB_USER -d $env:DB_NAME -v ON_ERROR_STOP=1 -f migrations_ASCII/020_cycling_active_mass.sql
psql -U $env:DB_USER -d $env:DB_NAME -v ON_ERROR_STOP=1 -f migrations_ASCII/d028_tape_projects_many_to_many.sql
psql -U $env:DB_USER -d $env:DB_NAME -v ON_ERROR_STOP=1 -f migrations_ASCII/d029_electrode_cut_batch_projects_many_to_many.sql
psql -U $env:DB_USER -d $env:DB_NAME -v ON_ERROR_STOP=1 -f migrations_ASCII/d030_battery_projects_many_to_many.sql
psql -U $env:DB_USER -d $env:DB_NAME -v ON_ERROR_STOP=1 -f migrations_ASCII/d031_harden_battery_stack_validate_trigger.sql
psql -U $env:DB_USER -d $env:DB_NAME -v ON_ERROR_STOP=1 -f migrations_ASCII/d032_create_schema_migrations_table.sql
psql -U $env:DB_USER -d $env:DB_NAME -v ON_ERROR_STOP=1 -f migrations_ASCII/d033_add_coating_side2_gap_and_drying_speed.sql
psql -U $env:DB_USER -d $env:DB_NAME -v ON_ERROR_STOP=1 -f migrations_ASCII/d034_update_wet_mixing_methods.sql
psql -U $env:DB_USER -d $env:DB_NAME -v ON_ERROR_STOP=1 -f migrations_ASCII/d035_add_item_created_at_dates.sql
psql -U $env:DB_USER -d $env:DB_NAME -v ON_ERROR_STOP=1 -f migrations_ASCII/d036_add_prism_form_factor.sql
psql -U $env:DB_USER -d $env:DB_NAME -v ON_ERROR_STOP=1 -f migrations_ASCII/d037_add_viscosity_conditions.sql
psql -U $env:DB_USER -d $env:DB_NAME -v ON_ERROR_STOP=1 -f migrations_ASCII/d038_add_electrode_capacity_average_flag.sql
```

These are intended as a catch-up set. Most are guarded with `IF NOT EXISTS`,
`ON CONFLICT`, or equivalent safe behavior, so re-running an already-applied
file should usually be harmless. Stop and inspect the database if any command
fails.

## Verify The Ledger

After `d032` through `d038` succeed:

```powershell
psql -U $env:DB_USER -d $env:DB_NAME -c "SELECT migration_stream, count(*) FROM schema_migrations GROUP BY migration_stream ORDER BY migration_stream;"
```

Expected current result:

```text
dalia | 26
dima  | 21
```

Historical rows created by `d032` have:

```text
source = d032_baseline
applied_at = NULL
```

That means the migration was already present before the ledger table existed,
but the original application time is unknown.

## Verify The Battery Stack Trigger

Also verify that `d031_harden_battery_stack_validate_trigger.sql` is present:

```powershell
psql -U $env:DB_USER -d $env:DB_NAME -c "SELECT (position('anode_count = cathode_count + 1' in pg_get_functiondef('public.validate_battery_stack()'::regprocedure)) > 0) AS allows_extra_anode, (position('cathode_count = anode_count + 1' in pg_get_functiondef('public.validate_battery_stack()'::regprocedure)) > 0) AS allows_extra_cathode, (position('TG_OP = ''UPDATE''' in pg_get_functiondef('public.validate_battery_stack()'::regprocedure)) > 0) AS handles_update;"
```

Expected:

```text
allows_extra_anode = true
allows_extra_cathode = false
handles_update = true
```

Record the database name, commands run, ledger counts, and trigger check result
as the Windows/lab release evidence.
