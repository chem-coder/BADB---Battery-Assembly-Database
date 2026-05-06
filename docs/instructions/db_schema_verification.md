# DB And Schema Verification

Created: 2026-05-06
Edited: 2026-05-06
Status: instruction
Source paths: `docs/archive/superseded/2026-05-06-inbox-cleanup/db-strict-no-assumptions.md`, `config/index.js`, `db/pool.js`

Use this before writing migrations, DB commands, or backend code that depends on schema/config.

## Core Instruction

Do not guess database names, table names, column names, or enum values from memory.

Before acting:

1. identify the exact database name the app is configured to use;
2. inspect the relevant schema from migrations, code, or the live database;
3. state the verified DB name and table/column names;
4. only then write migration SQL, DB commands, or backend code.

## Config Sources

Current app database config flows through:

- `config/index.js`
- `db/pool.js`

Common defaults:

- `DB_NAME` defaults to `badb_app_v1`;
- `DB_USER` defaults to `Dalia`;
- host, port, and password use PostgreSQL defaults unless environment variables or PostgreSQL client configuration provide them.

## Good Evidence

Acceptable schema evidence:

- current migration files;
- current service/route SQL;
- current database inspection through `psql`;
- tests or smoke checks that prove the path.

Archived notes and old prompt files are not enough.

## When To Stop

Stop and ask before changing anything if:

- the target database is unclear;
- schema evidence conflicts;
- a migration appears to have been applied in one environment but not another;
- a command could affect a non-throwaway database and the target is not explicit.
