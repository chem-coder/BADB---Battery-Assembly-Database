# Testing And Release Checks

Created: 2026-05-06
Edited: 2026-05-06
Status: instruction
Verified against code: 2026-05-06
Source paths: `package.json`, `scripts/check_vanilla_api_contract.js`, `scripts/smoke_vanilla_api.js`, `contracts/vanilla_api_endpoints.json`

This is the canonical release-check runbook for BADB.

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

The smoke harness:

- checks the vanilla API contract first;
- restores a SQL dump into a throwaway database;
- applies post-dump migrations through `d031`;
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

## Smoke Migration Coverage

The smoke harness applies these migrations after restoring the dump:

- `d028_tape_projects_many_to_many.sql`
- `d029_electrode_cut_batch_projects_many_to_many.sql`
- `d030_battery_projects_many_to_many.sql`
- `d031_harden_battery_stack_validate_trigger.sql`

That means smoke evidence covers the hardened battery stack trigger, including the service requirement that pouch/cylindrical stack inserts are safe even when the API payload arrives cathode-first.

## Release Evidence To Record

For a release or merge review, record:

- changed files;
- migration files added or applied;
- database checked or restored;
- exact commands run;
- pass/fail result for `git diff --check`, `npm test`, `npm run contract:vanilla`, and `npm run smoke:vanilla`;
- any skipped check and the reason.

If a migration is required for the changed behavior, release readiness requires proof that the target database has it or that the deployment process will apply it before users reach the changed path.
