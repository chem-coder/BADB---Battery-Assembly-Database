BEGIN;

ALTER TABLE public.batteries
  DROP CONSTRAINT IF EXISTS batteries_form_factor_check;

ALTER TABLE public.batteries
  ADD CONSTRAINT batteries_form_factor_check
  CHECK (form_factor IN ('coin', 'pouch', 'cylindrical', 'prism'));

ALTER TABLE public.electrode_cut_batches
  DROP CONSTRAINT IF EXISTS electrode_cut_batches_target_form_factor_check;

ALTER TABLE public.electrode_cut_batches
  ADD CONSTRAINT electrode_cut_batches_target_form_factor_check
  CHECK (
    target_form_factor IS NULL OR
    target_form_factor IN ('coin', 'pouch', 'cylindrical', 'prism')
  );

ALTER TABLE public.electrode_cut_batches
  DROP CONSTRAINT IF EXISTS electrode_cut_batches_target_shape_match_check;

ALTER TABLE public.electrode_cut_batches
  ADD CONSTRAINT electrode_cut_batches_target_shape_match_check
  CHECK (
    target_form_factor IS NULL OR
    (target_form_factor = 'coin' AND shape = 'circle') OR
    (target_form_factor IN ('pouch', 'cylindrical', 'prism') AND shape = 'rectangle')
  );

CREATE OR REPLACE FUNCTION public.validate_battery_stack()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    form TEXT;
    coin_mode TEXT;
    anode_count INT;
    cathode_count INT;
BEGIN
    SELECT form_factor
    INTO form
    FROM batteries
    WHERE battery_id = NEW.battery_id;

    IF form = 'coin' THEN
        SELECT coin_cell_mode
        INTO coin_mode
        FROM battery_coin_config
        WHERE battery_id = NEW.battery_id;
    END IF;

    SELECT
        COUNT(*) FILTER (WHERE role = 'anode'),
        COUNT(*) FILTER (WHERE role = 'cathode')
    INTO anode_count, cathode_count
    FROM battery_electrodes
    WHERE battery_id = NEW.battery_id;

    IF TG_OP = 'INSERT' THEN
        IF NEW.role = 'anode' THEN
            anode_count := anode_count + 1;
        ELSIF NEW.role = 'cathode' THEN
            cathode_count := cathode_count + 1;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.battery_id = NEW.battery_id THEN
            IF OLD.role = 'anode' THEN
                anode_count := anode_count - 1;
            ELSIF OLD.role = 'cathode' THEN
                cathode_count := cathode_count - 1;
            END IF;
        END IF;

        IF NEW.role = 'anode' THEN
            anode_count := anode_count + 1;
        ELSIF NEW.role = 'cathode' THEN
            cathode_count := cathode_count + 1;
        END IF;
    END IF;

    IF form = 'coin' THEN
        IF coin_mode = 'half_cell' AND (anode_count + cathode_count) > 1 THEN
            RAISE EXCEPTION 'Coin half-cell: only one electrode allowed';
        END IF;

        IF coin_mode = 'full_cell' THEN
            IF anode_count > 1 THEN
                RAISE EXCEPTION 'Coin full-cell: only one anode allowed';
            END IF;

            IF cathode_count > 1 THEN
                RAISE EXCEPTION 'Coin full-cell: only one cathode allowed';
            END IF;
        END IF;
    END IF;

    IF form IN ('pouch', 'cylindrical', 'prism') THEN
        IF NOT (
            anode_count = cathode_count OR
            anode_count = cathode_count + 1
        ) THEN
            RAISE EXCEPTION 'Stack must have equal cathode/anode counts or one extra anode';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

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
      'd036_add_prism_form_factor.sql',
      'dalia',
      now(),
      'manual',
      'Adds prism as a pouch-like battery and electrode target form factor.'
    )
    ON CONFLICT (migration_name) DO NOTHING;
  END IF;
END $$;

COMMIT;
