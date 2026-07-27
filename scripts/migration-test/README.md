# Migration rehearsal (`scripts/migration-test/`)

Proves a batch of pending migrations applies cleanly on top of a faithful copy
of the **lab's current state**, with data, **before** they are ever run on the
real lab database.

## Safety

- **Throwaway databases only** (`badb_migration_test`, `badb_migration_test_fresh`).
  The runner hard-refuses any target named `badb_app_v1` / `*lab*` / `*prod*`.
- **Never connects to the lab database.** The lab's state is reproduced locally
  by restoring a dump + applying migrations forward.

## How it works

1. Restores `sql_backups/local_only/0424_badb_app_v1_full.sql` (real data) and
   applies the post-dump migrations **through `d040`** → the lab baseline
   (verified 2026-06-19: `dalia=28 / dima=21`; see
   `docs/current/release_readiness.md`).
2. Loads `fixtures.sql` — synthetic edge cases the dump lacks (NULL project
   lead, a lead with a pre-existing non-admin grant, a NULL-`cut_batch_id`
   electrode source).
3. Applies the upgrade under test (`d041 → d042 → d043`).
4. Asserts: ledger counts, no data lost, `d042` backfill + `ON CONFLICT` upsert,
   `d043` surrogate id / `is_primary` / new partial-unique indexes actually
   enforce, idempotent re-run is a no-op, and the upgraded schema is byte-identical
   to a fresh `d043` install.

## Run

```bash
# local Postgres (Postgres.app) must be running
bash scripts/migration-test/run.sh
```

Exit code 0 = all checks passed. To rehearse a future batch, extend the
`UPGRADE` array in `run.sh` with the new migration filenames.
