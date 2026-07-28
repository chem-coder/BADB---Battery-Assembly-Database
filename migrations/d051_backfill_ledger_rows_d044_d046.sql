-- d051_backfill_ledger_rows_d044_d046.sql
-- Records d044, d045 and d046 in public.schema_migrations.
--
-- WHY: those three migrations apply their DDL correctly but never insert a
-- row into the ledger that this project treats as authoritative for
-- "which migrations has this database had?". The local dev database has the
-- three rows only because they were added by hand; any other database — the
-- Windows lab machine at cutover, a restored dump, the migration rehearsal —
-- applies the same files and ends up 3 rows short. Caught by
-- `scripts/migration-test/run.sh` on 2026-07-28: the rehearsal reached
-- dalia=35 where the documented expectation is 38.
--
-- Consequence without this: after the lab cutover the ledger count check in
-- docs/instructions/windows_version_cutover.md fails, and "is d045 applied
-- here?" cannot be answered from the ledger at all.
--
-- HOW: each row is recorded only when that migration's effect is actually
-- present in this database (same principle as d032, which verifies effects
-- rather than trusting a filename). A database that never ran d045 will not
-- be told that it did.
--
-- Forward-only and idempotent: ON CONFLICT DO NOTHING, and the probes are
-- read-only. Safe to re-run with the rest of the folder.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NULL THEN
    RAISE NOTICE 'schema_migrations absent — nothing to backfill';
    RETURN;
  END IF;

  -- d044: widened the user_project_access access_level CHECK to allow 'none'.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_project_access'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%none%'
  ) THEN
    INSERT INTO schema_migrations (migration_name, migration_stream, source, notes)
    VALUES ('d044_access_level_none.sql', 'dalia', 'migration_file',
            'Ledger row backfilled by d051; effect verified (access_level CHECK allows ''none'').')
    ON CONFLICT (migration_name) DO NOTHING;
  END IF;

  -- d045: created material_instance_components + its two indexes.
  IF to_regclass('public.material_instance_components') IS NOT NULL THEN
    INSERT INTO schema_migrations (migration_name, migration_stream, source, notes)
    VALUES ('d045_material_instance_components_ddl.sql', 'dalia', 'migration_file',
            'Ledger row backfilled by d051; effect verified (material_instance_components exists).')
    ON CONFLICT (migration_name) DO NOTHING;
  END IF;

  -- d046: added FK/join indexes and the missing updated_at/created_at columns.
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_electrode_cut_batches_tape_id') THEN
    INSERT INTO schema_migrations (migration_name, migration_stream, source, notes)
    VALUES ('d046_indexes_and_timestamps.sql', 'dalia', 'migration_file',
            'Ledger row backfilled by d051; effect verified (idx_electrode_cut_batches_tape_id exists).')
    ON CONFLICT (migration_name) DO NOTHING;
  END IF;
END $$;

INSERT INTO schema_migrations (migration_name, migration_stream, source, notes)
VALUES ('d051_backfill_ledger_rows_d044_d046.sql', 'dalia', 'migration_file',
        'Backfills the ledger rows d044-d046 never inserted; each gated on that migration''s verified effect.')
ON CONFLICT (migration_name) DO NOTHING;

COMMIT;
