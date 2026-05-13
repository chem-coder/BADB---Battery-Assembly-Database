BEGIN;

INSERT INTO public.wet_mixing_methods (wet_mixing_id, name, description)
VALUES
  (1, 'by_hand', U&'\0412\0440\0443\0447\043D\0443\044E (<15 \043C\043B)'),
  (2, 'mag_stir', U&'\041C\0430\0433\043D\0438\0442\043D\0430\044F \043C\0435\0448\0430\043B\043A\0430 (15-150 \043C\043B)'),
  (3, 'gn_vm_7', U&'\0412\0430\043A\0443\0443\043C\043D\044B\0439 \043C\0438\043A\0441\0435\0440 GELON GN-VM-7, 500 \043C\043B (150-450 \043C\043B)'),
  (4, 'acey_evm_1l', U&'\0412\0430\043A\0443\0443\043C\043D\044B\0439 \043C\0438\043A\0441\0435\0440 ACEY ACEY-EVM-1L, 1 \043B (300-750 \043C\043B)'),
  (5, 'gelon_gn_pm_5l', U&'\0414\0432\0443\0445\043F\043B\0430\043D\0435\0442\0430\0440\043D\044B\0439 \043C\0438\043A\0441\0435\0440 GELON GN-PM-5L, 5 \043B (1,5-3,5 \043B)')
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
