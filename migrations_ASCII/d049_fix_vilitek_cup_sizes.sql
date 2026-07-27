-- d049_fix_vilitek_cup_sizes.sql
-- Corrects the Vilitek mixing-cup reference data seeded by d048.
--
-- WHY: d048 seeded the cups from a best-guess note (30 / 80 / 250 ml, with
-- a ~125 ml working volume attached to the 250 ml guess). On 2026-07-17
-- Dalia confirmed the actual cup set in the lab: 30, 100, and 375 ml.
-- The 125 ml working volume belonged to the wrong 250 ml guess, so the
-- 375 ml cup's working volume is reset to NULL (= not yet measured).
--
-- The agate ball set was also confirmed as FOUR diameters (0.25 / 0.5 /
-- 0.75 / 1.0 cm); that is UI-side only (tape_step_mixing_balls stores a
-- numeric diameter), so no schema change is needed here.
--
-- Forward-only and idempotent: renames guard on the target name not
-- existing yet, so re-running is a no-op and a fresh database that ran
-- d048 first is corrected exactly once. Rows are renamed (not replaced)
-- so any tape_step_mixing.container_id references survive.

BEGIN;

-- 80 ml -> 100 ml (name + nominal volume; note already says the working
-- volume needs measuring, which is still true).
UPDATE mixing_containers
   SET name = U&'\0421\0442\0430\043A\0430\043D 100 \043C\043B (\0412\0438\043B\0438\0442\0435\043A)',
       nominal_volume_ml = 100
 WHERE name = U&'\0421\0442\0430\043A\0430\043D 80 \043C\043B (\0412\0438\043B\0438\0442\0435\043A)'
   AND NOT EXISTS (
     SELECT 1 FROM mixing_containers WHERE name = U&'\0421\0442\0430\043A\0430\043D 100 \043C\043B (\0412\0438\043B\0438\0442\0435\043A)'
   );

-- 250 ml -> 375 ml (name + nominal volume; drop the 125 ml working-volume
-- estimate that was tied to the wrong 250 ml guess).
UPDATE mixing_containers
   SET name = U&'\0421\0442\0430\043A\0430\043D 375 \043C\043B (\0412\0438\043B\0438\0442\0435\043A)',
       nominal_volume_ml = 375,
       max_working_volume_ml = NULL,
       notes = U&'\041D\0435 \0438\0441\043F\043E\043B\044C\0437\043E\0432\0430\043B\0441\044F; \0444\0430\043A\0442\0438\0447\0435\0441\043A\0438\0439 \0440\0430\0431\043E\0447\0438\0439 \043E\0431\044A\0451\043C \0443\0442\043E\0447\043D\0438\0442\044C'
 WHERE name = U&'\0421\0442\0430\043A\0430\043D 250 \043C\043B (\0412\0438\043B\0438\0442\0435\043A)'
   AND NOT EXISTS (
     SELECT 1 FROM mixing_containers WHERE name = U&'\0421\0442\0430\043A\0430\043D 375 \043C\043B (\0412\0438\043B\0438\0442\0435\043A)'
   );

-- -- Ledger -----------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    INSERT INTO schema_migrations (migration_name, migration_stream, source, notes)
    VALUES ('d049_fix_vilitek_cup_sizes.sql', 'dalia', 'migration_file',
            'Correct Vilitek cup sizes to the confirmed lab set: 30/100/375 ml (was 30/80/250); reset 375 ml working volume to NULL.')
    ON CONFLICT (migration_name) DO NOTHING;
  END IF;
END $$;

COMMIT;
