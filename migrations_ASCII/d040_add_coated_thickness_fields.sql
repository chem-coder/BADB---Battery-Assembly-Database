BEGIN;

ALTER TABLE public.tape_step_coating
  ADD COLUMN IF NOT EXISTS coated_thickness_um numeric,
  ADD COLUMN IF NOT EXISTS coated_thickness_um_side2 numeric;

COMMENT ON COLUMN public.tape_step_coating.coated_thickness_um IS
  'Measured coated thickness after coating/drying and before calendering, in micrometers for side 1.';

COMMENT ON COLUMN public.tape_step_coating.coated_thickness_um_side2 IS
  'Measured coated thickness after coating/drying and before calendering, in micrometers for side 2 when the tape is coated two-sided.';

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
      'd040_add_coated_thickness_fields.sql',
      'dalia',
      now(),
      'manual',
      'Adds separate measured coated-thickness fields for tape coating sides before calendering.'
    )
    ON CONFLICT (migration_name) DO NOTHING;
  END IF;
END $$;

COMMIT;
