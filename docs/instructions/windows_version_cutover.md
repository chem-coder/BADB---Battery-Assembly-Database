# Windows Version Cutover (DEFERRED — run only when Dalia says "ready")

Created: 2026-06-19
Edited: 2026-06-19
Status: instruction
Trigger: **DO NOT RUN YET.** Execute only when Dalia explicitly says she is ready
to update the Windows lab app to the new version — i.e. after Vue/vanilla parity
is finished and she is satisfied with the app. Until then this is a reference
checklist only.

Source paths: `docs/instructions/apply_migrations.md`,
`docs/instructions/windows_migration_catchup.md`,
`docs/current/release_readiness.md`, `scripts/migration-test/`

## Context

The Windows lab machine (`C:\DB_LabHIT\BADB_v1`) runs the currently-circulating
app on a database **verified at `d040`** (`dalia=28 / dima=21`) on 2026-06-19.
The repo has since advanced to `d043` plus Vue frontend work. Dalia is
**intentionally deferring** the Windows update until parity is done and she is
happy with the app. When that day comes, follow this checklist to cut over
safely.

## Preconditions (all true before starting)

- [ ] Vue/vanilla parity finished and the new version validated locally.
- [ ] All desired changes merged into `main`.
- [ ] Migration safety check passes. `d041 → d043` already rehearsed clean on
      2026-06-19 (see release_readiness.md "Lab Database Verification"). **If any
      migrations were added after `d043`, re-run the rehearsal first:**
      `bash scripts/migration-test/run.sh` (add the new files to its `UPGRADE` array).
- [ ] A low-traffic window; tell lab users the app will be briefly unavailable.

## Cutover steps (Windows / PowerShell, from `C:\DB_LabHIT\BADB_v1`)

1. **Stop the app server** so nothing writes mid-migration.
2. **Back up the database FIRST (non-negotiable):**
   ```powershell
   npm run backup        # or: windows_scripts\backup_badb.ps1
   # or manual:  pg_dump -U Dalia -d badb_app_v1 -Fc -f badb_pre_update.dump
   ```
   Confirm the backup file exists (and `npm run backup:verify` if you used the script).
3. **Get the new code:** `git pull`
4. **Refresh dependencies / build the frontend** — only if the new version
   changes deps or serves the Vue build:
   ```powershell
   npm ci
   npm ci --prefix client-web
   npm run build --prefix client-web
   ```
5. **Optional 10-second safety pre-check** (expect 0 rows — no project lead points
   at a missing user):
   ```powershell
   psql -U Dalia -d badb_app_v1 -c "SELECT project_id, lead_id FROM projects p WHERE lead_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.user_id = p.lead_id);"
   ```
6. **Apply pending migrations IN ORDER, ASCII mirror, stop-on-error:**
   ```powershell
   psql -U Dalia -d badb_app_v1 -v ON_ERROR_STOP=1 -f migrations_ASCII\d041_project_participants.sql
   psql -U Dalia -d badb_app_v1 -v ON_ERROR_STOP=1 -f migrations_ASCII\d042_project_leads_as_team_members.sql
   psql -U Dalia -d badb_app_v1 -v ON_ERROR_STOP=1 -f migrations_ASCII\d043_enable_multi_battery_electrode_sources.sql
   ```
   Apply any migrations newer than `d043` after these, in order. The general
   catch-up procedure and the protective `d032` caveat are in
   `windows_migration_catchup.md`.
7. **Verify the ledger** — expect `dalia=31`, `dima=21`:
   ```powershell
   psql -U Dalia -d badb_app_v1 -c "SELECT migration_stream, count(*) FROM schema_migrations GROUP BY 1 ORDER BY 1;"
   ```
8. **Optional:** run the `d031` trigger-behavior check from `apply_migrations.md`
   (closes the last outstanding lab-proof item in release_readiness.md).
9. **Restart the app server** and smoke-check: log in, open Tapes / Electrodes /
   Batteries, confirm data loads and a save works.
10. **Record evidence** (date, ledger counts, machine) in
    `docs/current/release_readiness.md`.

## If something goes wrong (rollback)

- Each migration is wrapped in a transaction with `ON_ERROR_STOP=1`, so a failure
  rolls back that file — no half-applied state. Fix and re-run (they are idempotent).
- If the app misbehaves after cutover: restore the pre-update backup
  (`npm run restore`, or `pg_restore` the `.dump`), revert the code
  (`git checkout <previous-commit>`), and restart the server.

## When done

Update `docs/current/release_readiness.md` (lab now on the new version at `d043`)
and tell Claude so the docs/memory get updated.
