BEGIN;

ALTER TABLE public.tape_step_mixing
  ADD COLUMN IF NOT EXISTS viscosity_conditions TEXT;

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
      'd037_add_viscosity_conditions.sql',
      'dalia',
      now(),
      'manual',
      'Adds optional viscosity measurement conditions for tape mixing.'
    )
    ON CONFLICT (migration_name) DO NOTHING;
  END IF;
END $$;

COMMIT;
