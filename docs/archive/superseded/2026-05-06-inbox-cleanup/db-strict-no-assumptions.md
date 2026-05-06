# DB Strict No Assumptions

Before writing migrations, DB commands, or backend code that depends on schema/config:

1. inspect the live config and identify the exact database name the app is using
2. inspect the relevant live schema or authoritative schema source
3. report back the exact table names, column names, and DB name
4. do not write code or commands until that inspection is complete
5. if any assumption would be required, stop and ask

## Strict rule

No assumptions.

For any migration or DB command:
- first verify the database name from app config
- first verify the real schema from the project files or live DB
- then state the findings explicitly
- only then write the migration/command

If you have not shown the verified DB name and verified column/table names, do not proceed.

## Short working version

No assumptions.

Before any migration or DB command, verify:
1. actual DB name from config
2. actual table/column names from schema or live DB

Then state them explicitly before proceeding.

## Why this exists

This prevents:
- wrong DB
- wrong column names
- wrong assumptions from old memory instead of current project state

In this project, this rule would have forced discovery of the real app DB name before writing or running migration commands.
