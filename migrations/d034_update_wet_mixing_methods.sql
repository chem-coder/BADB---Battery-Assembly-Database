BEGIN;

INSERT INTO public.wet_mixing_methods (wet_mixing_id, name, description)
VALUES
  (1, 'by_hand', 'Вручную (<15 мл)'),
  (2, 'mag_stir', 'Магнитная мешалка (15-150 мл)'),
  (3, 'gn_vm_7', 'Вакуумный миксер GELON GN-VM-7, 500 мл (150-450 мл)'),
  (4, 'acey_evm_1l', 'Вакуумный миксер ACEY ACEY-EVM-1L, 1 л (300-750 мл)'),
  (5, 'gelon_gn_pm_5l', 'Двухпланетарный миксер GELON GN-PM-5L, 5 л (1,5-3,5 л)')
ON CONFLICT (wet_mixing_id) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

SELECT setval(
  pg_get_serial_sequence('public.wet_mixing_methods', 'wet_mixing_id'),
  GREATEST(
    COALESCE((SELECT max(wet_mixing_id) FROM public.wet_mixing_methods), 1),
    5
  ),
  true
);

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
      'd034_update_wet_mixing_methods.sql',
      'dalia',
      now(),
      'manual',
      'Updates wet mixing method reference values and adds 1 L and 5 L mixer options.'
    )
    ON CONFLICT (migration_name) DO NOTHING;
  END IF;
END $$;

COMMIT;
