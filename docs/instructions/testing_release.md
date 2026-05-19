# Testing And Release Checks

Created: 2026-05-06
Edited: 2026-05-15
Status: instruction
Verified against code: 2026-05-15
Source paths: `package.json`, `scripts/check_vanilla_api_contract.js`, `scripts/smoke_vanilla_api.js`, `contracts/vanilla_api_endpoints.json`

This is the canonical release-check runbook for BADB.

Current release posture: vanilla v1 release candidate. Local automated checks
support the release candidate only; pilot readiness still requires explicit
Windows/lab database proof from `public.schema_migrations`, the `d031` trigger
verification, and the manual destructive battery flow spot-check listed in
`docs/current/release_readiness.md`.

## Standard Checks After Code Changes

Run syntax checks for changed JavaScript files:

```bash
node --check services/batteryElectrodeStackService.js
node --check scripts/smoke_vanilla_api.js
```

Use the actual changed files for the branch.

Then run:

```bash
git diff --check
npm test
npm run contract:vanilla
npm run smoke:vanilla
```

These are the current release-check commands. Record exact command output or
pass/fail summaries in the release evidence.

For frontend workflow or visual changes, also open the affected page in a browser and verify the user flow directly.

## Unit Tests

```bash
npm test
```

This runs:

```bash
vitest run
```

## Vanilla API Contract

```bash
npm run contract:vanilla
```

This runs `scripts/check_vanilla_api_contract.js`.

The contract check verifies that:

- vanilla `fetch()` calls in `public/js/**/*.js` are represented in `contracts/vanilla_api_endpoints.json`;
- contracted Express routes exist;
- local scripts referenced by vanilla HTML pages exist;
- dynamic fetch helpers are documented.

Useful inspection variant:

```bash
node scripts/check_vanilla_api_contract.js --print-current
```

## Vanilla Smoke

```bash
npm run smoke:vanilla
```

This runs `scripts/smoke_vanilla_api.js`.

A current successful full smoke run is expected to finish with zero failures;
the last recorded release checkpoint on 2026-05-19 was 261 checks, 0 failures.
If the check count changes because the smoke surface changes, update the
release readiness record with the new count.

The smoke harness:

- checks the vanilla API contract first;
- restores a SQL dump into a throwaway database;
- applies current post-dump migrations needed by the restored dump, including
  `002`, `018`, `019`, `020`, and `d028` through `d039`;
- starts the Express API against the throwaway database with `AUTH_BYPASS=true`;
- exercises vanilla-facing GET and write paths;
- checks selected dependency/conflict behavior;
- cleans up smoke data and drops the throwaway database unless told to keep it.

Useful variants:

```bash
npm run smoke:vanilla -- --get-only
npm run smoke:vanilla -- --keep-db --verbose
npm run smoke:vanilla -- --dump=sql_backups/local_only/0424_badb_app_v1_full.sql
npm run smoke:vanilla -- --restore-only
```

The smoke database name must start with:

```text
badb_app_v1_smoke
```

This guard prevents accidental destructive work against the real database.
Do not point the smoke harness at the Windows/lab pilot database; it is a
throwaway restored-copy check, not proof that the lab database is migrated.

## Smoke Migration Coverage

The current smoke harness applies these migrations after restoring the dump, in
this order:

- `002_raw_submissions.sql`
- `018_department_real_names_and_assignments.sql`
- `019_cycling_summary_extra_metrics.sql`
- `020_cycling_active_mass.sql`
- `d028_tape_projects_many_to_many.sql`
- `d029_electrode_cut_batch_projects_many_to_many.sql`
- `d030_battery_projects_many_to_many.sql`
- `d031_harden_battery_stack_validate_trigger.sql`
- `d032_create_schema_migrations_table.sql`
- `d033_add_coating_side2_gap_and_drying_speed.sql`
- `d034_update_wet_mixing_methods.sql`
- `d035_add_item_created_at_dates.sql`
- `d036_add_prism_form_factor.sql`
- `d037_add_viscosity_conditions.sql`
- `d038_add_electrode_capacity_average_flag.sql`
- `d039_add_electrode_test_batch_flag.sql`

`d032_create_schema_migrations_table.sql` creates the authoritative
`public.schema_migrations` ledger and backfills the current baseline. A current
migrated database should report `dima = 21` and `dalia = 27` after `d039` from:

```bash
psql -d badb_app_v1 -c "SELECT migration_stream, count(*) FROM schema_migrations GROUP BY migration_stream ORDER BY migration_stream;"
```

That means smoke evidence covers the restored-copy schema baseline and the
hardened battery stack trigger, including the service requirement that
pouch/prism/cylindrical stack inserts are safe even when the API payload arrives
cathode-first.

Windows/lab pilot use still requires direct proof from the Windows/lab database
itself: the `schema_migrations` stream counts must be current, and
`d031_harden_battery_stack_validate_trigger.sql` must be verified. Use the
queries from `docs/instructions/apply_migrations.md` and record the results
before pilot use.

## Release Evidence To Record

For a release or merge review, record:

- changed files;
- migration files added or applied;
- database checked or restored;
- target-database `schema_migrations` stream counts when migrations are part of
  the release proof;
- exact commands run;
- pass/fail result for `git diff --check`, `npm test`, `npm run contract:vanilla`, and `npm run smoke:vanilla`;
- Windows/lab database `schema_migrations` counts and `d031` verification
  result before pilot use;
- manual destructive battery flow spot-check result before pilot use;
- any skipped check and the reason.

If a migration is required for the changed behavior, release readiness requires proof that the target database has it or that the deployment process will apply it before users reach the changed path.
