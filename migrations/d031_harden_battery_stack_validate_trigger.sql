BEGIN;

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

    IF form IN ('pouch', 'cylindrical') THEN
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

COMMIT;
