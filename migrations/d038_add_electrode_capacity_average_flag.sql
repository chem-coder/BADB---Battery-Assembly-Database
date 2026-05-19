BEGIN;

ALTER TABLE public.electrodes
  ADD COLUMN IF NOT EXISTS include_in_capacity_average BOOLEAN;

UPDATE public.electrodes
SET include_in_capacity_average = (status_code <> 3)
WHERE include_in_capacity_average IS NULL;

ALTER TABLE public.electrodes
  ALTER COLUMN include_in_capacity_average SET DEFAULT TRUE,
  ALTER COLUMN include_in_capacity_average SET NOT NULL;

COMMENT ON COLUMN public.electrodes.include_in_capacity_average IS
  'Manual per-electrode flag controlling inclusion in electrode cut batch capacity averages.';

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
      'd038_add_electrode_capacity_average_flag.sql',
      'dalia',
      now(),
      'manual',
      'Adds manual per-electrode inclusion flag for electrode batch capacity averages.'
    )
    ON CONFLICT (migration_name) DO NOTHING;
  END IF;
END $$;

COMMIT;
