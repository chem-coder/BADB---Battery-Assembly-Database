# Backup And Restore

Created: 2026-05-06
Edited: 2026-05-06
Status: instruction
Verified against code: 2026-05-06
Source paths: `scripts/backup.js`, `package.json`, `scripts/launchd/README.md`, `scripts/launchd/install.sh`, `config/index.js`

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
