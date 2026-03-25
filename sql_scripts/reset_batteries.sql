-- CLEAR ALL BATTERY RECORDS & restart dattery_id counter. 
-- Restore electrode_status to "available"

-- HOW TO RUN:
-- From project root folder (i.e. RENERA/BADB_v1/), run psql. Then:

-- \set ON_ERROR_STOP on
-- \i sql_scripts/reset_batteries.sql


BEGIN;

-- 1. Return all used electrodes from batteries → available
UPDATE electrodes e
SET 
  used_in_battery_id = NULL,
  status_code = 1            -- available
WHERE e.electrode_id IN (
  SELECT DISTINCT electrode_id
  FROM battery_electrodes
);

-- 2. Now safely wipe battery-related tables
TRUNCATE TABLE
  battery_electrodes,
  battery_electrode_sources,
  battery_coin_config,
  battery_pouch_config,
  battery_cyl_config,
  battery_sep_config,
  battery_electrolyte,
  battery_qc,
  battery_electrochem
RESTART IDENTITY;

-- 3. Now, delete the batteries
DELETE FROM batteries;

-- 4. Reset the batteries ID sequence (since DELETE does not reset it)
ALTER SEQUENCE batteries_battery_id_seq RESTART WITH 1;

COMMIT;
