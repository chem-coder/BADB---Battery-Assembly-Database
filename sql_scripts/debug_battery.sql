-- View full battery record by battery_id

-- HOW TO RUN:
-- From project root folder (i.e. RENERA/BADB_v1/), run psql. Then:

-- \set battery_id 2
-- \i sql_scripts/debug_battery.sql

SELECT jsonb_pretty(jsonb_build_object(

  'battery',
  (SELECT row_to_json(b)
   FROM batteries b
   WHERE b.battery_id = :battery_id),

  'coin_config',
  (SELECT row_to_json(c)
   FROM battery_coin_config c
   WHERE c.battery_id = :battery_id),

  'pouch_config',
  (SELECT row_to_json(p)
   FROM battery_pouch_config p
   WHERE p.battery_id = :battery_id),

  'cyl_config',
  (SELECT row_to_json(cy)
   FROM battery_cyl_config cy
   WHERE cy.battery_id = :battery_id),

  'separator',
  (SELECT row_to_json(s)
   FROM battery_sep_config s
   WHERE s.battery_id = :battery_id),

  'electrolyte',
  (SELECT row_to_json(e)
   FROM battery_electrolyte e
   WHERE e.battery_id = :battery_id),

  'qc',
  (SELECT row_to_json(q)
   FROM battery_qc q
   WHERE q.battery_id = :battery_id),

  'electrode_sources',
  (SELECT row_to_json(es)
   FROM battery_electrode_sources es
   WHERE es.battery_id = :battery_id),

  'electrodes',
  (SELECT COALESCE(
     jsonb_agg(to_jsonb(el) ORDER BY el.position_index),
     '[]'::jsonb
   )
   FROM battery_electrodes el
   WHERE el.battery_id = :battery_id)

)) AS full_battery;
