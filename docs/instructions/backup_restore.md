# Backup And Restore

Created: 2026-05-06
Edited: 2026-05-15
Status: instruction
Verified against code: 2026-05-15
Source paths: `scripts/backup.js`, `package.json`, `scripts/launchd/README.md`, `scripts/launchd/install.sh`, `config/index.js`, `migrations/README.md`, `scripts/smoke_vanilla_api.js`

Use `scripts/backup.js` for normal BADB backups. It wraps `pg_dump`, writes checksum and manifest files, records a log, and can verify or restore backups.

## Default Backup

From `BADB_main`:

```bash
npm run backup
```

This writes a PostgreSQL custom-format dump to:

```text
sql_backups/auto/
```

Each backup also gets:

- a `.sha256` checksum file;
- a `.manifest.json` file;
- an append-only entry in `sql_backups/auto/backup.log`.

The script uses the database settings from `config/index.js`, so `DB_NAME`, `DB_USER`, and other PostgreSQL environment settings can override the defaults.

## Plain SQL Backup

```bash
npm run backup:plain
```

Equivalent direct command:

```bash
node scripts/backup.js --format=plain
```

Plain SQL backups are useful for inspection and portability, but the custom `.dump` format is the normal restore target.

## List And Verify

```bash
npm run backup:list
npm run backup:verify
```

Verify a specific backup:

```bash
node scripts/backup.js --verify sql_backups/auto/<backup-file>.dump
```

The script verifies the checksum when a `.sha256` file exists and checks dump integrity with PostgreSQL tooling.

## Restore

Restore is destructive to the target database. Confirm `DB_NAME` before running it.

Restore the latest backup:

```bash
npm run restore
```

Restore a specific backup:

```bash
node scripts/backup.js --restore sql_backups/auto/<backup-file>.dump
```

For custom dumps, restore uses `pg_restore --clean --if-exists`. For plain SQL files, restore uses `psql --file`.

The restore path includes a short safety delay before it runs.

## Retention And Copy

Default retention keeps backups for 30 days and always keeps at least 5 backups.

Useful direct variants:

```bash
node scripts/backup.js --keep-days=30
node scripts/backup.js --copy-to=/Volumes/NAS/backups/badb
node scripts/backup.js --dry-run
```

## Automatic macOS Backups

The macOS launchd helper is local-only:

```bash
bash scripts/launchd/install.sh
```

Status:

```bash
bash scripts/launchd/install.sh --status
```

Uninstall:

```bash
bash scripts/launchd/install.sh --uninstall
```

The installed job runs daily at 23:00 and uses:

```bash
node scripts/backup.js --keep-days=30
```

The generated LaunchAgent plist is not committed; only the template is kept in the repo.

For Linux use cron. For Windows use Task Scheduler.

## Manual pg_dump Fallback

Use this only when the managed backup script is unavailable:

```bash
pg_dump -d badb_app_v1 > badb_app_v1_full.sql
pg_dump -d badb_app_v1 --schema-only > badb_app_v1_schema.sql
```

Restore a plain SQL fallback:

```bash
psql -d badb_app_v1 -f badb_app_v1_full.sql
```

Prefer `scripts/backup.js` for routine work because it adds checksums, manifests, logging, retention, and restore verification.

## After Restoring An Older Dump

After restoring an older dump for release or lab work, apply the current missing
migrations in order before pilot use. Run these commands from `BADB_main`, not
the outer `RENERA` workspace.

For the current 0424-style restored dump, the post-dump set is:

```bash
psql -d badb_app_v1 -v ON_ERROR_STOP=1 -f migrations/002_raw_submissions.sql
psql -d badb_app_v1 -v ON_ERROR_STOP=1 -f migrations/018_department_real_names_and_assignments.sql
psql -d badb_app_v1 -v ON_ERROR_STOP=1 -f migrations/019_cycling_summary_extra_metrics.sql
psql -d badb_app_v1 -v ON_ERROR_STOP=1 -f migrations/020_cycling_active_mass.sql
psql -d badb_app_v1 -v ON_ERROR_STOP=1 -f migrations/d028_tape_projects_many_to_many.sql
psql -d badb_app_v1 -v ON_ERROR_STOP=1 -f migrations/d029_electrode_cut_batch_projects_many_to_many.sql
psql -d badb_app_v1 -v ON_ERROR_STOP=1 -f migrations/d030_battery_projects_many_to_many.sql
psql -d badb_app_v1 -v ON_ERROR_STOP=1 -f migrations/d031_harden_battery_stack_validate_trigger.sql
psql -d badb_app_v1 -v ON_ERROR_STOP=1 -f migrations/d032_create_schema_migrations_table.sql
psql -d badb_app_v1 -v ON_ERROR_STOP=1 -f migrations/d033_add_coating_side2_gap_and_drying_speed.sql
psql -d badb_app_v1 -v ON_ERROR_STOP=1 -f migrations/d034_update_wet_mixing_methods.sql
psql -d badb_app_v1 -v ON_ERROR_STOP=1 -f migrations/d035_add_item_created_at_dates.sql
psql -d badb_app_v1 -v ON_ERROR_STOP=1 -f migrations/d036_add_prism_form_factor.sql
```

On Windows/lab, use `migrations_ASCII/` for the same files if encoding is a
risk. `d032_create_schema_migrations_table.sql` should be run before later
ledger-aware migrations such as `d033`, `d034`, `d035`, and `d036`, because it verifies earlier migration
effects before creating the baseline ledger rows.

After `d032`, `public.schema_migrations` is the authoritative migration ledger.
The flat `migrations_log.txt` files are only human checkpoint notes. A current
local `badb_app_v1` ledger reports `dima = 21` and `dalia = 24` after `d036`;
use the same stream-count query from `docs/instructions/apply_migrations.md`
on the restored or Windows/lab target.

`d031_harden_battery_stack_validate_trigger.sql` must also be verified on the
Windows/lab database before pilot use.

After the migration proof is recorded, run the current release checks from the
repo checkout:

```bash
npm run contract:vanilla
npm run smoke:vanilla
```

`npm run smoke:vanilla` restores into its own throwaway `badb_app_v1_smoke...`
database and does not prove the Windows/lab database has current
`schema_migrations` counts or `d031`; use the verification queries in
`docs/instructions/apply_migrations.md` for that proof.
