Manual SQL scripts for BADB.

WARNING:
- These scripts are manual dev/admin tools, not normal app workflow.
- Always verify the database name before running anything.
- Reset scripts are destructive and dev-only unless Dalia explicitly says
  otherwise.
- Prefer tracked migrations for schema changes.

How to run these scripts:

From psql, do:

\set ON_ERROR_STOP on
\i sql_scripts/your_script.sql

Notes:
- Scripts in sql_scripts/reset_scripts/ should be run with their full path, for example:
  \i sql_scripts/reset_scripts/reset_batteries.sql
- These scripts are intended to be run from /Users/Dalia/Developer/RENERA/BADB_main
  while connected to the badb_app_v1 database.
