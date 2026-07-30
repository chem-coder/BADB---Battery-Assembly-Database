-- d056 — tape storage notes (Dalia, 2026-07-30).
--
-- P2 of the Vue simplification plan (docs/future/drybox_removal_plan.md,
-- approved 2026-07-30): the dry-box closet tracking (place/remove/return
-- workflow + the cut-batch auto-placement coupling) is retired in the Vue
-- product. Storage events become a free-form operator note on the tape
-- («вынута из шкафа на 30 мин 30.07, вернула И.И.»).
--
-- tape_dry_box_state and tapes.availability_status stay (forward-only;
-- historical data remains readable; 'depleted' keeps working).
--
-- Forward-only: one additive nullable column.

BEGIN;

ALTER TABLE public.tapes
  ADD COLUMN IF NOT EXISTS storage_notes text;

COMMENT ON COLUMN public.tapes.storage_notes IS
  'Free-form storage log (P2, 2026-07-30): operator-written notes about dry-box storage events, replacing the retired place/remove/return tracking. Separate from tapes.notes (general remarks).';

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
      'd056_tape_storage_notes.sql',
      'dalia',
      now(),
      'manual',
      'tapes.storage_notes TEXT — free-form storage log replacing dry-box closet tracking (P2, drybox_removal_plan.md).'
    )
    ON CONFLICT (migration_name) DO NOTHING;
  END IF;
END $$;

COMMIT;
