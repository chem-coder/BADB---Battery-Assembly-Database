-- Disassemble a battery record, putting the electrodes "back" as "available"

-- HOW TO RUN:
-- From project root folder (i.e. RENERA/BADB_v1/), run psql. Then:

-- \set battery_id 2
-- \i sql_scripts/disassemble_battery.sql

BEGIN;

-- 1. Mark electrodes as available again
UPDATE electrodes e
SET status_code = 1  	-- available
WHERE e.electrode_id IN (
  SELECT electrode_id
  FROM battery_electrodes
  WHERE battery_id = :battery_id
);

-- 2. Remove stack structure
DELETE FROM battery_electrodes
WHERE battery_id = :battery_id;

-- 3. Remove provenance (sources)
DELETE FROM battery_electrode_sources
WHERE battery_id = :battery_id;

-- 4. Clear dependent configs (optional but clean)
DELETE FROM battery_coin_config WHERE battery_id = :battery_id;
DELETE FROM battery_pouch_config WHERE battery_id = :battery_id;
DELETE FROM battery_cyl_config WHERE battery_id = :battery_id;
DELETE FROM battery_sep_config WHERE battery_id = :battery_id;
DELETE FROM battery_electrolyte WHERE battery_id = :battery_id;
DELETE FROM battery_qc WHERE battery_id = :battery_id;

-- 5. Mark battery as disassembled (DO NOT delete header)
UPDATE batteries
SET status = 'disassembled'
WHERE battery_id = :battery_id;

COMMIT;