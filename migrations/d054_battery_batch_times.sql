-- d054 — batch times for batteries (Dalia, 2026-07-29).
--
-- Lab reality (glovebox workflow): batteries are assembled in batches and
-- only two moments are worth recording — when the BATCH assembly started
-- and when the BATCH was tested (OCV/ESR). Both are stored per battery.
--
-- 1. batteries.item_created_at DATE → TIMESTAMPTZ. The Vue constructor
--    always showed a time-of-day input for this field, but the DATE
--    column silently discarded it (the «time doesn't save» bug).
--    Existing values become midnight Europe/Moscow — no information
--    is lost (only dates were ever stored).
-- 2. battery_qc.tested_at TIMESTAMPTZ NULL — when the batch was tested.
--
-- Forward-only: a type widening plus an additive column; no data loss.

BEGIN;

ALTER TABLE public.batteries
  ALTER COLUMN item_created_at DROP DEFAULT,
  ALTER COLUMN item_created_at TYPE timestamptz
    USING (item_created_at::timestamp AT TIME ZONE 'Europe/Moscow'),
  ALTER COLUMN item_created_at SET DEFAULT now();

COMMENT ON COLUMN public.batteries.item_created_at IS
  'User-facing batch assembly start datetime (glovebox batch; entered once per batch, stored per battery). Was DATE until d054 — pre-d054 rows are midnight Europe/Moscow. created_at remains the audit record creation timestamp.';

ALTER TABLE public.battery_qc
  ADD COLUMN IF NOT EXISTS tested_at timestamptz;

COMMENT ON COLUMN public.battery_qc.tested_at IS
  'User-facing batch testing datetime (OCV/ESR measurement moment; entered once per batch, stored per battery). NULL = not tested yet.';

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
      'd054_battery_batch_times.sql',
      'dalia',
      now(),
      'manual',
      'Batch times for batteries: item_created_at DATE->TIMESTAMPTZ (MSK midnight backfill) and battery_qc.tested_at TIMESTAMPTZ for the batch testing moment.'
    )
    ON CONFLICT (migration_name) DO NOTHING;
  END IF;
END $$;

COMMIT;
