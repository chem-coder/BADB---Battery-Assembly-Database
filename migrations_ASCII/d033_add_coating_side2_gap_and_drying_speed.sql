BEGIN;

ALTER TABLE public.tape_step_coating
  ADD COLUMN IF NOT EXISTS gap_um_side2 numeric;

COMMENT ON COLUMN public.tape_step_coating.gap_um_side2 IS
  'Coating gap in micrometers for side 2 when the tape is coated two-sided.';

ALTER TABLE public.tape_step_drying
  ADD COLUMN IF NOT EXISTS drying_speed_text text;

COMMENT ON COLUMN public.tape_step_drying.drying_speed_text IS
  'Human-readable tape movement speed through the drying chamber when relevant.';

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
      'd033_add_coating_side2_gap_and_drying_speed.sql',
      'dalia',
      now(),
      'manual',
      'Adds side-2 coating gap and drying-speed text fields for tape coating workflow.'
    )
    ON CONFLICT (migration_name) DO NOTHING;
  END IF;
END $$;

COMMIT;
