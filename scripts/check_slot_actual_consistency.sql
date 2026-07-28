-- check_slot_actual_consistency.sql — READ-ONLY report.
--
-- Lists tapes whose ACTIVE-SLOT actual references a material instance that
-- does not belong to the tape's current active material. This happens when a
-- tape's active material is re-pointed after weighing was recorded (e.g.
-- during the manual materials cleanup) — nothing in the app warns about it.
--
-- Usage:  psql -d badb_app_v1 -f scripts/check_slot_actual_consistency.sql
-- Empty result = everything consistent. Rows = re-open that tape's weighing
-- step and re-select the instance for the active line.

SELECT
  t.tape_id,
  t.name                    AS tape,
  m_tape.name               AS tape_active_material,
  mi.name                   AS actual_instance,
  m_inst.name               AS instance_belongs_to
FROM tapes t
JOIN tape_recipe_lines rl
  ON rl.tape_recipe_id = t.tape_recipe_id
 AND rl.recipe_role IN ('cathode_active', 'anode_active')
JOIN tape_recipe_line_actuals a
  ON a.tape_id = t.tape_id
 AND a.recipe_line_id = rl.recipe_line_id
JOIN material_instances mi ON mi.material_instance_id = a.material_instance_id
JOIN materials m_inst      ON m_inst.material_id = mi.material_id
LEFT JOIN materials m_tape ON m_tape.material_id = t.active_material_id
WHERE t.active_material_id IS DISTINCT FROM mi.material_id
ORDER BY t.tape_id;
