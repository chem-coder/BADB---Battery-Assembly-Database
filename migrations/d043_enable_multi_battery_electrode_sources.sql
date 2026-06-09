BEGIN;

ALTER TABLE public.battery_electrode_sources
  ADD COLUMN IF NOT EXISTS battery_electrode_source_id bigint;

CREATE SEQUENCE IF NOT EXISTS public.battery_electrode_sources_source_id_seq;

ALTER SEQUENCE public.battery_electrode_sources_source_id_seq
  OWNED BY public.battery_electrode_sources.battery_electrode_source_id;

UPDATE public.battery_electrode_sources
SET battery_electrode_source_id = nextval('public.battery_electrode_sources_source_id_seq'::regclass)
WHERE battery_electrode_source_id IS NULL;

SELECT setval(
  'public.battery_electrode_sources_source_id_seq'::regclass,
  GREATEST(
    COALESCE((SELECT MAX(battery_electrode_source_id) FROM public.battery_electrode_sources), 0),
    1
  ),
  (SELECT MAX(battery_electrode_source_id) IS NOT NULL FROM public.battery_electrode_sources)
);

ALTER TABLE public.battery_electrode_sources
  ALTER COLUMN battery_electrode_source_id SET DEFAULT nextval('public.battery_electrode_sources_source_id_seq'::regclass);

ALTER TABLE public.battery_electrode_sources
  ALTER COLUMN battery_electrode_source_id SET NOT NULL;

ALTER TABLE public.battery_electrode_sources
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

ALTER TABLE public.battery_electrode_sources
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT true;

UPDATE public.battery_electrode_sources
SET is_primary = true
WHERE is_primary IS DISTINCT FROM true;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t
      ON t.oid = c.conrelid
    JOIN pg_namespace n
      ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'battery_electrode_sources'
      AND c.conname = 'battery_electrode_sources_pkey'
      AND c.contype = 'p'
      AND pg_get_constraintdef(c.oid) = 'PRIMARY KEY (battery_id, role)'
  ) THEN
    ALTER TABLE public.battery_electrode_sources
      DROP CONSTRAINT battery_electrode_sources_pkey;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t
      ON t.oid = c.conrelid
    JOIN pg_namespace n
      ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'battery_electrode_sources'
      AND c.contype = 'p'
  ) THEN
    ALTER TABLE public.battery_electrode_sources
      ADD CONSTRAINT battery_electrode_sources_pkey PRIMARY KEY (battery_electrode_source_id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bes_battery_role_batch
  ON public.battery_electrode_sources (battery_id, role, cut_batch_id)
  WHERE cut_batch_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bes_one_primary_per_role
  ON public.battery_electrode_sources (battery_id, role)
  WHERE is_primary;

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
      'd043_enable_multi_battery_electrode_sources.sql',
      'dalia',
      now(),
      'manual',
      'Adds per-row IDs, ordering, primary markers, and multi-batch uniqueness for battery electrode sources.'
    )
    ON CONFLICT (migration_name) DO NOTHING;
  END IF;
END $$;

COMMIT;
