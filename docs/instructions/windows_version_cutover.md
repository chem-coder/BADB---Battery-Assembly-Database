# Windows Version Cutover (DEFERRED — run only when Dalia says "ready")

Created: 2026-06-19
Edited: 2026-06-19
Status: instruction
Edited: 2026-07-29 (steps refreshed for the d053 cutover)
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

Lab is at `d040`; this update brings it to `d053` (13 migrations).

1. **Stop the app server** so nothing writes mid-migration (close the window
   running it, or Ctrl+C).

2. **Back up the database FIRST (non-negotiable).** This is the only safety
   net — there is no rehearsal against lab data.
   ```powershell
   npm run backup
   npm run backup:verify
   ```
   Confirm the backup file exists before continuing.

3. **Get the new code:**
   ```powershell
   git pull
   ```

4. **Install deps and BUILD THE FRONTEND — required now.** The Vue app is
   served from `public-vue/`, which is not in git; without this step the
   root URL has nothing to serve.
   ```powershell
   npm ci
   npm ci --prefix client-web
   npm run build:web
   ```

5. **Optional 10-second safety pre-check** (expect 0 rows):
   ```powershell
   psql -U Dalia -d badb_app_v1 -c "SELECT project_id, lead_id FROM projects p WHERE lead_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.user_id = p.lead_id);"
   ```

6. **Apply the 13 migrations IN ORDER** (ASCII mirror, stop-on-error). Paste
   the whole block; it stops at the first failure:
   ```powershell
   $files = @(
     "d041_project_participants",
     "d042_project_leads_as_team_members",
     "d043_enable_multi_battery_electrode_sources",
     "d044_access_level_none",
     "d045_material_instance_components_ddl",
     "d046_indexes_and_timestamps",
     "d047_recipe_active_material_slot",
     "d048_vilitek_mixer_containers_and_balls",
     "d049_fix_vilitek_cup_sizes",
     "d050_recipe_slot_marker_am",
     "d051_backfill_ledger_rows_d044_d046",
     "d052_materials_manufacturer_families",
     "d053_tape_and_batch_files"
   )
   foreach ($f in $files) {
     Write-Host "Applying $f ..."
     psql -U Dalia -d badb_app_v1 -v ON_ERROR_STOP=1 -f "migrations_ASCII\$f.sql"
     if ($LASTEXITCODE -ne 0) { Write-Host "STOPPED at $f" -ForegroundColor Red; break }
   }
   ```
   Notes: `d047` restructures recipes (active material moves to the tape) and
   merges identical recipes — it computes everything from live data, keeps old
   names in recipe notes, and runs its data steps exactly once. `d052` only
   fills blanks; anything it does not recognise is left untouched for manual
   cleanup.

7. **Verify the ledger** — expect `dalia=41`, `dima=21`:
   ```powershell
   psql -U Dalia -d badb_app_v1 -c "SELECT migration_stream, count(*) FROM schema_migrations GROUP BY 1 ORDER BY 1;"
   ```

8. **Run the `d031` trigger-behavior check** from `apply_migrations.md` — this
   closes the last outstanding lab-proof item in `release_readiness.md`.

9. **Start the app server:**
   ```powershell
   npm start
   ```
   Do NOT use `npm run dev` on Windows — the `dev` scripts use a POSIX
   `PORT=3003` prefix that cmd/PowerShell cannot parse. `npm start` is the
   lab path.

10. **Smoke-check in the browser.** The front door changed: **`http://localhost:3003`
    now opens the Vue app** (login, home, everything). Vanilla still exists at
    `http://localhost:3003/index.html` if you need it. Check: log in, open
    Ленты / Электроды / Аккумуляторы, confirm data loads and one save works.

11. **After any manual materials cleanup** (re-pointing a tape's active
    material to a corrected product entry), run the read-only report — empty
    result = nothing lost; each listed tape needs its weighing step re-opened
    and the active-line instance re-selected:
    ```powershell
    psql -U Dalia -d badb_app_v1 -f scripts\check_slot_actual_consistency.sql
    ```

12. **Record evidence** (date, ledger counts, machine) in
    `docs/current/release_readiness.md`.

## If something goes wrong (rollback)

- Each migration is wrapped in a transaction with `ON_ERROR_STOP=1`, so a failure
  rolls back that file — no half-applied state. Fix and re-run (they are idempotent).
- If the app misbehaves after cutover: restore the pre-update backup
  (`npm run restore`, or `pg_restore` the `.dump`), revert the code
  (`git checkout <previous-commit>`), and restart the server.

## When done

Update `docs/current/release_readiness.md` (lab now on the new version at `d053`)
and tell Claude so the docs/memory get updated.
