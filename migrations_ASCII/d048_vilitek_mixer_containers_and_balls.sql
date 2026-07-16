-- d048_vilitek_mixer_containers_and_balls.sql
-- Adds the Vilitek V-ITT-300s vacuum planetary centrifugal mixer, mixing
-- containers (cups), and per-step milling-ball records.
--
-- WHY: the lab now prepares small slurry batches (10-15 g of active material)
-- in the Vilitek planetary centrifugal mixer with agate balls (0.5 / 0.75 /
-- 1.0 cm diameter, arbitrary counts), and this is the preferred small-volume
-- method instead of the magnetic stirrer. The balls and the cup used are part
-- of the process record and are also the dataset for a future data-driven
-- suggestion of how many balls to use (current lab rule: total ball volume
-- is about 1/3 of the slurry volume).
--
-- WHAT:
--   1. wet_mixing_methods gains the auto-selection window
--      (auto_min_volume_ml / auto_max_volume_ml) that previously lived
--      hardcoded in public/js/1-tapes.js, plus uses_balls / uses_containers
--      capability flags that drive the ball/cup UI per method (other ball
--      mills can be enabled later by flipping the flags on their rows).
--      Selection rule implemented in code: among methods with a window,
--      match auto_min <= v <= auto_max; on boundary overlap the row with
--      the larger auto_min wins. The magnetic stirrer keeps NULL bounds:
--      manually selectable, never auto-suggested (the Vilitek takes over
--      the 15-150 ml window).
--   2. New wet_mixing_methods row 'vilitek_vitt_300s' (15-150 ml, balls +
--      containers enabled).
--   3. New mixing_containers reference table, seeded with the Vilitek cups
--      (30 / 80 / 250 ml; working volumes are best-effort and editable).
--   4. tape_step_mixing.container_id (FK, RESTRICT).
--   5. New tape_step_mixing_balls (step_id, diameter_cm, ball_count) child
--      table with a touch-parent trigger, one row per ball diameter used.
--
-- Forward-only and idempotent: IF NOT EXISTS guards, name-keyed inserts with
-- WHERE NOT EXISTS, and window backfills only where still NULL so re-running
-- the folder never clobbers later manual edits. No IDs are hardcoded.
-- See docs/current/database_schema.md and docs/current/tapes.md.

BEGIN;

-- -- 1) Auto-selection window + capability flags ----------------------

ALTER TABLE wet_mixing_methods ADD COLUMN IF NOT EXISTS auto_min_volume_ml numeric;
ALTER TABLE wet_mixing_methods ADD COLUMN IF NOT EXISTS auto_max_volume_ml numeric;
ALTER TABLE wet_mixing_methods ADD COLUMN IF NOT EXISTS uses_balls boolean NOT NULL DEFAULT false;
ALTER TABLE wet_mixing_methods ADD COLUMN IF NOT EXISTS uses_containers boolean NOT NULL DEFAULT false;

-- Windows formerly hardcoded in getWetMixingMethodIdForVolume() in
-- public/js/1-tapes.js. mag_stir deliberately gets none.
UPDATE wet_mixing_methods SET auto_min_volume_ml = 0, auto_max_volume_ml = 15
 WHERE name = 'by_hand' AND auto_min_volume_ml IS NULL AND auto_max_volume_ml IS NULL;
UPDATE wet_mixing_methods SET auto_min_volume_ml = 150, auto_max_volume_ml = 450
 WHERE name = 'gn_vm_7' AND auto_min_volume_ml IS NULL AND auto_max_volume_ml IS NULL;
UPDATE wet_mixing_methods SET auto_min_volume_ml = 450, auto_max_volume_ml = 750
 WHERE name = 'acey_evm_1l' AND auto_min_volume_ml IS NULL AND auto_max_volume_ml IS NULL;
UPDATE wet_mixing_methods SET auto_min_volume_ml = 1500, auto_max_volume_ml = 3500
 WHERE name = 'gelon_gn_pm_5l' AND auto_min_volume_ml IS NULL AND auto_max_volume_ml IS NULL;

-- -- 2) The Vilitek mixer ---------------------------------------------

INSERT INTO wet_mixing_methods
  (name, description, auto_min_volume_ml, auto_max_volume_ml, uses_balls, uses_containers)
SELECT
  'vilitek_vitt_300s',
  U&'\0412\0430\043A\0443\0443\043C\043D\044B\0439 \043F\043B\0430\043D\0435\0442\0430\0440\043D\043E-\0446\0435\043D\0442\0440\043E\0431\0435\0436\043D\044B\0439 \043C\0438\043A\0441\0435\0440 \0412\0438\043B\0438\0442\0435\043A V-ITT-300s (15-150 \043C\043B)',
  15, 150, true, true
WHERE NOT EXISTS (
  SELECT 1 FROM wet_mixing_methods WHERE name = 'vilitek_vitt_300s'
);

-- -- 3) Mixing containers (cups) --------------------------------------

CREATE TABLE IF NOT EXISTS mixing_containers (
  container_id          SERIAL PRIMARY KEY,
  name                  text NOT NULL UNIQUE,
  nominal_volume_ml     numeric,
  -- Realistic fill limit including balls; NULL = not yet measured.
  max_working_volume_ml numeric,
  notes                 text,
  sort_order            integer NOT NULL DEFAULT 0,
  CONSTRAINT mixing_containers_nominal_volume_positive
    CHECK (nominal_volume_ml IS NULL OR nominal_volume_ml > 0),
  CONSTRAINT mixing_containers_working_volume_positive
    CHECK (max_working_volume_ml IS NULL OR max_working_volume_ml > 0)
);

INSERT INTO mixing_containers (name, nominal_volume_ml, max_working_volume_ml, notes, sort_order)
SELECT U&'\0421\0442\0430\043A\0430\043D 30 \043C\043B (\0412\0438\043B\0438\0442\0435\043A)', 30, NULL,
       U&'\041F\043E\0434\0445\043E\0434\0438\0442 \043F\0440\0438\043C\0435\0440\043D\043E \0434\043B\044F 10-15 \0433 \0430\043A\0442\0438\0432\043D\043E\0433\043E \043C\0430\0442\0435\0440\0438\0430\043B\0430', 1
WHERE NOT EXISTS (SELECT 1 FROM mixing_containers WHERE name = U&'\0421\0442\0430\043A\0430\043D 30 \043C\043B (\0412\0438\043B\0438\0442\0435\043A)');

INSERT INTO mixing_containers (name, nominal_volume_ml, max_working_volume_ml, notes, sort_order)
SELECT U&'\0421\0442\0430\043A\0430\043D 80 \043C\043B (\0412\0438\043B\0438\0442\0435\043A)', 80, NULL,
       U&'\0423\0442\043E\0447\043D\0438\0442\044C \0444\0430\043A\0442\0438\0447\0435\0441\043A\0438\0439 \0440\0430\0431\043E\0447\0438\0439 \043E\0431\044A\0451\043C', 2
WHERE NOT EXISTS (SELECT 1 FROM mixing_containers WHERE name = U&'\0421\0442\0430\043A\0430\043D 80 \043C\043B (\0412\0438\043B\0438\0442\0435\043A)');

INSERT INTO mixing_containers (name, nominal_volume_ml, max_working_volume_ml, notes, sort_order)
SELECT U&'\0421\0442\0430\043A\0430\043D 250 \043C\043B (\0412\0438\043B\0438\0442\0435\043A)', 250, 125,
       U&'\0417\0430\043F\043E\043B\043D\044F\0435\0442\0441\044F \043F\0440\0438\043C\0435\0440\043D\043E \0434\043E 125 \043C\043B \0432\043C\0435\0441\0442\0435 \0441 \0448\0430\0440\0430\043C\0438', 3
WHERE NOT EXISTS (SELECT 1 FROM mixing_containers WHERE name = U&'\0421\0442\0430\043A\0430\043D 250 \043C\043B (\0412\0438\043B\0438\0442\0435\043A)');

-- -- 4) Container used on the mixing step -----------------------------

ALTER TABLE tape_step_mixing ADD COLUMN IF NOT EXISTS container_id integer
  REFERENCES mixing_containers(container_id) ON DELETE RESTRICT;

-- -- 5) Milling balls used on the mixing step -------------------------

CREATE TABLE IF NOT EXISTS tape_step_mixing_balls (
  step_id     integer NOT NULL
    REFERENCES tape_step_mixing(step_id) ON DELETE CASCADE,
  diameter_cm numeric NOT NULL,
  ball_count  integer NOT NULL,
  CONSTRAINT tape_step_mixing_balls_pkey PRIMARY KEY (step_id, diameter_cm),
  CONSTRAINT tape_step_mixing_balls_diameter_positive CHECK (diameter_cm > 0),
  CONSTRAINT tape_step_mixing_balls_count_positive CHECK (ball_count > 0)
);

DROP TRIGGER IF EXISTS trg_tape_step_mixing_balls_touch_parent ON tape_step_mixing_balls;
CREATE TRIGGER trg_tape_step_mixing_balls_touch_parent
AFTER INSERT OR UPDATE OR DELETE ON tape_step_mixing_balls
FOR EACH ROW EXECUTE FUNCTION touch_parent_tape_from_step_id();

-- -- 6) Ledger --------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    INSERT INTO schema_migrations (migration_name, migration_stream, source, notes)
    VALUES ('d048_vilitek_mixer_containers_and_balls.sql', 'dalia', 'migration_file',
            'Vilitek V-ITT-300s mixer, mixing containers, per-step milling balls, DB-driven wet-mixing auto-selection windows.')
    ON CONFLICT (migration_name) DO NOTHING;
  END IF;
END $$;

COMMIT;
