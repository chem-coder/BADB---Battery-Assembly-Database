BEGIN;

ALTER TABLE public.electrode_cut_batches
  ADD COLUMN IF NOT EXISTS is_test_batch BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.electrode_cut_batches.is_test_batch IS
  'Marks an electrode cut batch as a test batch that is not expected to go through electrode drying.';

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    INSERT INTO public.schema_migrations (
      migration_name,
      migration_stream,
      applied_at,
      source,
      notes
    )
    VALUES (
      'd039_add_electrode_test_batch_flag.sql',
      'dalia',
      now(),
      'manual',
      'Adds test-batch/no-drying flag for electrode cut batches.'
    )
    ON CONFLICT (migration_name) DO NOTHING;
  END IF;
END $$;

COMMIT;
