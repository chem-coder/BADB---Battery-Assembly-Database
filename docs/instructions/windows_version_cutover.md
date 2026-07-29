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

## Lab environment (confirmed from the d040 update)

The lab machine does **not** use the same DB user/name as Dalia's Mac.
Everything below uses the real lab values:

| | Lab (Windows) | Dev (Mac) |
|---|---|---|
| DB user | `postgres` | `Dalia` |
| DB name | `badb_v1` | `badb_app_v1` |
| Folder | `C:\DB_LabHIT\BADB_v1` | `~/Developer/RENERA/BADB_main` |

Lab was last updated to **`d040`** (`dalia = 28`, `dima = 21`, 49 rows).
This update applies **d041 → d053** and ends at **`dalia = 41`, `dima = 21`**.

---

## Cutover steps (Windows / PowerShell, from `C:\DB_LabHIT\BADB_v1`)

### Step 0 — set the environment (every new PowerShell window)

```powershell
cd C:\DB_LabHIT\BADB_v1
$env:DB_USER="postgres"
$env:DB_NAME="badb_v1"
$env:PGPASSWORD="1"
```

Check the connection before anything else — this must print a number:

```powershell
psql -U $env:DB_USER -d $env:DB_NAME -c "SELECT count(*) FROM tapes;"
```

### Step 1 — STOP THE APP

Close the window running the server (or Ctrl+C). Nothing may write to the
database during the migrations.

### Step 2 — BACK UP THE DATABASE (the data, not the code)

This is the only safety net. Do not skip it, do not continue until the file
exists and has a real size.

```powershell
pg_dump -U $env:DB_USER -d $env:DB_NAME -f sql_backups\backup_before_2026-07-29_updates.sql
```

Verify it is real (size should be megabytes, not 0):

```powershell
Get-Item sql_backups\backup_before_2026-07-29_updates.sql | Select-Object Name, Length, LastWriteTime
```

> **To restore later if anything goes wrong:**
> ```powershell
> psql -U $env:DB_USER -d $env:DB_NAME -f sql_backups\backup_before_2026-07-29_updates.sql
> ```

### Step 3 — record the "before" state

Write these numbers down; they let you prove nothing was lost:

```powershell
psql -U $env:DB_USER -d $env:DB_NAME -c "SELECT migration_stream, count(*) FROM schema_migrations GROUP BY 1 ORDER BY 1;"
psql -U $env:DB_USER -d $env:DB_NAME -c "SELECT (SELECT count(*) FROM tapes) AS tapes, (SELECT count(*) FROM tape_recipes) AS recipes, (SELECT count(*) FROM electrodes) AS electrodes, (SELECT count(*) FROM batteries) AS batteries, (SELECT count(*) FROM tape_recipe_line_actuals) AS actuals;"
```

Expected ledger before: `dalia = 28`, `dima = 21`.

### Step 4 — get the new code

```powershell
git status
```
Must NOT say "fatal: not a git repository". If it lists local changes you did
not make, stop and ask before continuing.

```powershell
git pull origin main
```

### Step 5 — install dependencies and BUILD THE FRONTEND (new, required)

The Vue app is served from `public-vue\`, which is **not** in git. Without this
step the app has nothing to serve at the root URL.

```powershell
npm ci
npm ci --prefix client-web
npm run build:web
```

Confirm the build landed:

```powershell
Get-ChildItem public-vue\index.html
```

### Step 6 — safety pre-check (expect **0 rows**)

```powershell
psql -U $env:DB_USER -d $env:DB_NAME -c "SELECT project_id, lead_id FROM projects p WHERE lead_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.user_id = p.lead_id);"
```

If any row comes back, `d041`/`d042` will fail — stop and report it.

---

## Step 7 — the migrations, ONE AT A TIME

**How to run each one:** paste the single command, read the output, check the
ledger number, then move to the next.

**If a migration errors:** each file runs inside a transaction with
`ON_ERROR_STOP=1`, so a failure rolls the whole file back — the database stays
consistent and nothing is half-applied. **Stop there.** Copy the full error
text and report it. Do not run the next migration.

**Re-running is safe.** Every migration is idempotent; if you are unsure
whether one completed, run it again.

**Normal, harmless output:** lines like
`NOTICE: relation "..." already exists, skipping` — that is the idempotency
guard doing its job, not an error.

### 7.1 — d041 (project participants)

```powershell
psql -U $env:DB_USER -d $env:DB_NAME -v ON_ERROR_STOP=1 -f migrations_ASCII\d041_project_participants.sql
```
Creates `project_participants` and seeds each project's lead as a member.
**Ledger after: dalia = 29**

### 7.2 — d042 (leads as team members)

```powershell
psql -U $env:DB_USER -d $env:DB_NAME -v ON_ERROR_STOP=1 -f migrations_ASCII\d042_project_leads_as_team_members.sql
```
Upgrades each project lead's access to `admin`.
**Ledger after: dalia = 30**

### 7.3 — d043 (multiple electrode sources per battery)

```powershell
psql -U $env:DB_USER -d $env:DB_NAME -v ON_ERROR_STOP=1 -f migrations_ASCII\d043_enable_multi_battery_electrode_sources.sql
```
Gives `battery_electrode_sources` a surrogate primary key so a battery can use
several cut batches per side. Existing rows all become `is_primary = true`.
**Ledger after: dalia = 31**

### 7.4 — d044 (access level "none")

```powershell
psql -U $env:DB_USER -d $env:DB_NAME -v ON_ERROR_STOP=1 -f migrations_ASCII\d044_access_level_none.sql
```
Widens the access CHECK to allow an explicit "no access" grant.
**Ledger after: dalia = 31 — unchanged, this is CORRECT** (see box below).

### 7.5 — d045 (composition table DDL)

```powershell
psql -U $env:DB_USER -d $env:DB_NAME -v ON_ERROR_STOP=1 -f migrations_ASCII\d045_material_instance_components_ddl.sql
```
Ensures `material_instance_components` exists. On the lab it very likely
already does — expect "already exists, skipping".
**Ledger after: dalia = 31 — unchanged, CORRECT**

### 7.6 — d046 (indexes and timestamps)

```powershell
psql -U $env:DB_USER -d $env:DB_NAME -v ON_ERROR_STOP=1 -f migrations_ASCII\d046_indexes_and_timestamps.sql
```
Adds missing FK indexes and `created_at`/`updated_at` columns.
**Ledger after: dalia = 31 — unchanged, CORRECT**

> ### ⚠️ Do not panic at 7.4–7.6
> `d044`, `d045` and `d046` apply their changes but **never wrote a row into
> the ledger** — an old oversight. The count staying at **31** through all
> three is expected and correct. `d051` (step 7.11) records them retroactively.

### 7.7 — d047 (recipes decoupled from active materials) — THE BIG ONE

Snapshot first:

```powershell
psql -U $env:DB_USER -d $env:DB_NAME -c "SELECT count(*) AS recipes_before FROM tape_recipes;"
```

```powershell
psql -U $env:DB_USER -d $env:DB_NAME -v ON_ERROR_STOP=1 -f migrations_ASCII\d047_recipe_active_material_slot.sql
```

What it does, computed entirely from your live data:
- adds `materials.family` and `tapes.active_material_id`;
- moves each tape's chemistry from the recipe onto the tape;
- empties the active line of every recipe (it becomes an open slot);
- **merges recipes that are now identical**, remapping tapes and weighing
  actuals line-for-line (old names are kept in each recipe's notes);
- renames recipes after their composition («96 АМ : 2.2 Super P : 1.8 PVDF»).

Verify — recipe count may legitimately DROP (that is the merge working), while
tapes and actuals must be unchanged from Step 3:

```powershell
psql -U $env:DB_USER -d $env:DB_NAME -c "SELECT (SELECT count(*) FROM tape_recipes) AS recipes_after, (SELECT count(*) FROM tapes) AS tapes, (SELECT count(*) FROM tape_recipe_line_actuals) AS actuals, (SELECT count(*) FROM tapes WHERE active_material_id IS NULL) AS tapes_without_material;"
```
`tapes_without_material` should be 0 for tapes that had a recipe.
**Ledger after: dalia = 32**

### 7.8 — d048 (Vilitek mixer, cups, milling balls)

```powershell
psql -U $env:DB_USER -d $env:DB_NAME -v ON_ERROR_STOP=1 -f migrations_ASCII\d048_vilitek_mixer_containers_and_balls.sql
```
**Ledger after: dalia = 33**

### 7.9 — d049 (correct the cup sizes)

```powershell
psql -U $env:DB_USER -d $env:DB_NAME -v ON_ERROR_STOP=1 -f migrations_ASCII\d049_fix_vilitek_cup_sizes.sql
```
**Ledger after: dalia = 34**

### 7.10 — d050 (recipe slot marker «АМ»)

```powershell
psql -U $env:DB_USER -d $env:DB_NAME -v ON_ERROR_STOP=1 -f migrations_ASCII\d050_recipe_slot_marker_am.sql
```
**Ledger after: dalia = 35**

### 7.11 — d051 (ledger backfill for d044–d046)

```powershell
psql -U $env:DB_USER -d $env:DB_NAME -v ON_ERROR_STOP=1 -f migrations_ASCII\d051_backfill_ledger_rows_d044_d046.sql
```
Records d044/d045/d046 retroactively — each only if its effect is actually
present in this database. This is why the count jumps by 4.
**Ledger after: dalia = 39**

### 7.12 — d052 (materials: manufacturer + family vocabulary)

```powershell
psql -U $env:DB_USER -d $env:DB_NAME -v ON_ERROR_STOP=1 -f migrations_ASCII\d052_materials_manufacturer_families.sql
```
Adds `materials.manufacturer`, the family vocabulary, and fills family/
manufacturer **for known products only** — anything it does not recognise is
left exactly as it is, for manual cleanup.
**Ledger after: dalia = 40**

### 7.13 — d053 (file attachments on tapes and cut batches)

```powershell
psql -U $env:DB_USER -d $env:DB_NAME -v ON_ERROR_STOP=1 -f migrations_ASCII\d053_tape_and_batch_files.sql
```
**Ledger after: dalia = 41**

---

## Step 8 — final verification

```powershell
psql -U $env:DB_USER -d $env:DB_NAME -c "SELECT migration_stream, count(*) FROM schema_migrations GROUP BY 1 ORDER BY 1;"
```
**Expected: `dalia = 41`, `dima = 21` (62 rows total).**

Compare the data counts against Step 3 — tapes, electrodes, batteries and
actuals must be unchanged; only `recipes` may be lower (merged by d047):

```powershell
psql -U $env:DB_USER -d $env:DB_NAME -c "SELECT (SELECT count(*) FROM tapes) AS tapes, (SELECT count(*) FROM tape_recipes) AS recipes, (SELECT count(*) FROM electrodes) AS electrodes, (SELECT count(*) FROM batteries) AS batteries, (SELECT count(*) FROM tape_recipe_line_actuals) AS actuals;"
```

Optional, closes the last open lab-proof item — the `d031` trigger check from
`apply_migrations.md`.

## Step 9 — start the app

```powershell
npm start
```

> **Do NOT use `npm run dev` on Windows.** Those scripts use a Unix-style
> `PORT=3003` prefix that PowerShell cannot parse. `npm start` is the lab path.

## Step 10 — smoke-check in the browser

**The front door changed: `http://localhost:3003` now opens the Vue app.**
The old vanilla interface is still there at `http://localhost:3003/index.html`.

Check, in order:
1. log in;
2. open **Ленты** — the list loads, «Лента №» and «Активный материал» columns
   are visible;
3. open one tape in the constructor — its recipe and weighing data are intact;
4. open **Электроды** and **Аккумуляторы** — data loads;
5. make one small edit and save it.

## Step 11 — expected cosmetics after the update

On **Материалы** you will see red «Производитель: неизвестен» and a red
«Без семейства» group for lab materials the migration did not recognise.
**That is not damage — it is the cleanup list**, and only you fill it in.

After any manual cleanup where you re-point a tape's active material:

```powershell
psql -U $env:DB_USER -d $env:DB_NAME -f scripts\check_slot_actual_consistency.sql
```
Empty result = nothing lost. Any listed tape needs its weighing step re-opened
and the active-line instance re-selected.

## Step 12 — record the evidence

Note the date, the final ledger counts and the machine in
`docs/current/release_readiness.md`.

## If something goes wrong (rollback)

- Each migration is wrapped in a transaction with `ON_ERROR_STOP=1`, so a failure
  rolls back that file — no half-applied state. Stop at that migration, copy the
  full error, and report it. Do not run the next one. Migrations are idempotent,
  so re-running after a fix is safe.
- **Full restore of the data** (undoes everything, back to the Step 2 snapshot):
  ```powershell
  psql -U $env:DB_USER -d $env:DB_NAME -f sql_backups\backup_before_2026-07-29_updates.sql
  ```
- To also revert the code: `git checkout <previous-commit>`, then `npm ci` and
  `npm run build:web` again, then restart with `npm start`.

## When done

Update `docs/current/release_readiness.md` (lab now on the new version at `d053`)
and tell Claude so the docs/memory get updated.
