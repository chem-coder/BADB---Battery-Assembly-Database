-- d055 — battery purpose (Dalia, 2026-07-30).
--
-- Paper-protocol parity («Протокол-сборки-v5», часть II): the form has a
-- mandatory field «Цель партии (зачем собрана, что проверяем)» — the single
-- most requested answer when a battery is found in the lab. battery_notes
-- stays free-form operational notes; purpose is the experiment intent.
--
-- Forward-only: one additive nullable column.

BEGIN;

ALTER TABLE public.batteries
  ADD COLUMN IF NOT EXISTS purpose text;

COMMENT ON COLUMN public.batteries.purpose IS
  'Experiment intent: why this battery (batch) was assembled, what is being tested. Mirrors «Цель партии» of the paper protocol (Протокол-сборки-v5, часть II). Free-form notes stay in battery_notes.';

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
      'd055_battery_purpose.sql',
      'dalia',
      now(),
      'manual',
      'batteries.purpose TEXT — experiment intent («Цель партии» from paper protocol v5); battery_notes remains free-form notes.'
    )
    ON CONFLICT (migration_name) DO NOTHING;
  END IF;
END $$;

COMMIT;
