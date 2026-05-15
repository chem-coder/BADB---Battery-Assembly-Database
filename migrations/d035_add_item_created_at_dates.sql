BEGIN;

ALTER TABLE public.tapes
  ADD COLUMN IF NOT EXISTS item_created_at DATE;

UPDATE public.tapes
SET item_created_at = COALESCE(item_created_at, created_at::date, CURRENT_DATE)
WHERE item_created_at IS NULL;

ALTER TABLE public.tapes
  ALTER COLUMN item_created_at SET DEFAULT CURRENT_DATE,
  ALTER COLUMN item_created_at SET NOT NULL;

COMMENT ON COLUMN public.tapes.item_created_at IS
  'User-facing physical creation date for the tape. created_at remains the audit record creation timestamp.';

ALTER TABLE public.electrode_cut_batches
  ADD COLUMN IF NOT EXISTS item_created_at DATE;

UPDATE public.electrode_cut_batches
SET item_created_at = COALESCE(item_created_at, created_at::date, CURRENT_DATE)
WHERE item_created_at IS NULL;

ALTER TABLE public.electrode_cut_batches
  ALTER COLUMN item_created_at SET DEFAULT CURRENT_DATE,
  ALTER COLUMN item_created_at SET NOT NULL;

COMMENT ON COLUMN public.electrode_cut_batches.item_created_at IS
  'User-facing physical creation date for the electrode cut batch. created_at remains the audit record creation timestamp.';

ALTER TABLE public.batteries
  ADD COLUMN IF NOT EXISTS item_created_at DATE;

UPDATE public.batteries
SET item_created_at = COALESCE(item_created_at, created_at::date, CURRENT_DATE)
WHERE item_created_at IS NULL;

ALTER TABLE public.batteries
  ALTER COLUMN item_created_at SET DEFAULT CURRENT_DATE,
  ALTER COLUMN item_created_at SET NOT NULL;

COMMENT ON COLUMN public.batteries.item_created_at IS
  'User-facing physical creation date for the battery. created_at remains the audit record creation timestamp.';

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
      'd035_add_item_created_at_dates.sql',
      'dalia',
      now(),
      'manual',
      'Adds editable physical item creation dates to tapes, electrode cut batches, and batteries while preserving created_at as audit metadata.'
    )
    ON CONFLICT (migration_name) DO NOTHING;
  END IF;
END $$;

COMMIT;
