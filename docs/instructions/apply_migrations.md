# Apply Migrations

Created: 2026-05-06
Edited: 2026-05-09
Status: instruction
Verified against code: 2026-05-09
Source paths: `migrations/README.md`, `migrations/`, `migrations_ASCII/`, `migrations/migrations_log.txt`, `migrations_ASCII/migrations_log.txt`, `scripts/smoke_vanilla_api.js`

BADB migrations are manual, forward-only SQL files.

## Source Folders

Use both migration folders:

- `migrations/` is the main migration folder.
- `migrations_ASCII/` is the ASCII-safe mirror for Windows/encoding-sensitive use.

When adding a migration, keep both folders in sync and update both migration logs:

- `migrations/migrations_log.txt`
- `migrations_ASCII/migrations_log.txt`

Do not rename, rewrite, or reorder a migration that has already landed in `main`.

## Numbering Streams

The current convention from `migrations/README.md`:

- numeric `NNN_*` migrations belong to Dima's stream;
- `dNNN_*` migrations belong to Dalia's stream.

Use the next file in the correct stream, then document what was applied.

## Current Order

Apply migrations in alphabetical file order unless a release note gives a
smaller explicit post-dump set:

```text
001_... through 020_...
d013_... through d031_harden_battery_stack_validate_trigger.sql
```

The current vanilla smoke restored-copy path applies only the migrations missing
from the old smoke dump:

```text
d028_tape_projects_many_to_many.sql
d029_electrode_cut_batch_projects_many_to_many.sql
d030_battery_projects_many_to_many.sql
d031_harden_battery_stack_validate_trigger.sql
```

Do not treat a local smoke pass as proof that the Windows/lab database has these
migrations. The Windows/lab database must be checked directly.

## Apply One Migration

From `BADB_main`, apply explicit migration files:

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
the Windows/lab database. Apply the ASCII mirror on Windows unless the UTF-8
main migration has already been applied and verified.

## Fresh Or Restored Database

For a fresh database or a restored older dump, apply the needed migrations in order. Prefer explicit filenames for release work so the evidence is clear.

The vanilla smoke harness restores the old dump into a throwaway database and then applies its post-dump migrations automatically. Current post-dump smoke migrations include:

- `migrations/d028_tape_projects_many_to_many.sql`
- `migrations/d029_electrode_cut_batch_projects_many_to_many.sql`
- `migrations/d030_battery_projects_many_to_many.sql`
- `migrations/d031_harden_battery_stack_validate_trigger.sql`

This is the expected migration set for the current smoke harness. If a future
branch adds a post-dump migration, update `scripts/smoke_vanilla_api.js` and
this document together.

## Check d031 Battery Stack Trigger

`d031_harden_battery_stack_validate_trigger.sql` hardens `validate_battery_stack()` so pouch and cylindrical stacks allow equal anode/cathode counts or one extra anode, never one extra cathode. It also handles updates.

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
and the three expected boolean values. The lab database is not considered ready
for pilot use until this check proves `d031` is present.

As of 2026-05-09, the local migration logs record Dalia's stream through `d031`.
