# pg_dump Workflow

## 1. Backup data and schema (full dump)

```bash
pg_dump -d badb_app_v1 > badb_app_v1_full.sql
```

This includes:

- table structure
- data
- constraints

## 2. Backup schema only

```bash
pg_dump -d badb_app_v1 --schema-only > badb_app_v1_schema.sql
```

This includes:

- tables
- types
- constraints
- no data

## Optional: add clean/replace behavior

```bash
pg_dump -d badb_app_v1 --clean > badb_app_v1_full.sql
pg_dump -d badb_app_v1 --schema-only --clean > badb_app_v1_schema.sql
```

## If username is needed

```bash
pg_dump -U your_user -d badb_app_v1 > badb_app_v1_full.sql
```

## Restore reminder

```bash
psql -d badb_app_v1 -f badb_app_v1_full.sql
```

That is all that is needed for the current workflow.
