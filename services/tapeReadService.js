const {
  WORKFLOW_STATUS_ORDER,
  computeTapeMixtureRows,
  fetchWorkflowStatusMap
} = require('./tapeWorkflowService');
const { attachTapeProjects } = require('./tapeProjectService');
const { attachElectrodeBatchProjects } = require('./electrodeBatchProjectService');

function statusError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function defaultWorkflowStatus() {
  return {
    workflow_status_code: 'recipe_materials',
    workflow_status_label: 'Выбор экземпляров',
    workflow_complete: false
  };
}

async function getTapeStepByCode(pool, tapeId, code) {
  let subtypeJoin = '';
  let subtypeSelect = '';

  if (
    code === 'drying_am' ||
    code === 'drying_tape' ||
    code === 'drying_pressed_tape'
  ) {
    subtypeJoin = `
      LEFT JOIN tape_step_drying d
        ON d.step_id = s.step_id
    `;
    subtypeSelect = `
      d.temperature_c,
      d.atmosphere,
      d.target_duration_min,
      d.drying_speed_text,
      d.other_parameters
    `;
  }

  if (code === 'mixing') {
    subtypeJoin = `
      LEFT JOIN tape_step_mixing m
        ON m.step_id = s.step_id
    `;
    subtypeSelect = `
      m.slurry_volume_ml,
      m.dry_mixing_id,
      m.dry_start_time,
      m.dry_duration_min,
      m.dry_end_time,
      m.dry_rpm,
      m.wet_mixing_id,
      m.wet_start_time,
      m.wet_duration_min,
      m.wet_end_time,
      m.wet_rpm,
      m.viscosity_cP
    `;
  }

  if (code === 'coating') {
    subtypeJoin = `
      LEFT JOIN tape_step_coating c
        ON c.step_id = s.step_id
    `;
    subtypeSelect = `
      c.foil_id,
      c.coating_id,
      c.coating_sidedness,
      c.gap_um,
      c.gap_um_side2,
      c.coat_temp_c,
      c.coat_time_min,
      c.method_comments
    `;
  }

  if (code === 'calendering') {
    subtypeJoin = `
      LEFT JOIN tape_step_calendering cal
        ON cal.step_id = s.step_id
    `;
    subtypeSelect = `
      cal.temp_c,
      cal.pressure_value,
      cal.pressure_units,
      cal.draw_speed_m_min,
      cal.other_params,
      cal.init_thickness_microns,
      cal.final_thickness_microns,
      cal.no_passes,
      cal.appearance
    `;
  }

  const result = await pool.query(
    `
    SELECT
      s.step_id,
      s.tape_id,
      s.operation_type_id,
      s.performed_by,
      s.started_at,
      s.ended_at,
      s.comments
      ${subtypeSelect ? ',' + subtypeSelect : ''}
    FROM tape_process_steps s
    JOIN operation_types ot
      ON ot.operation_type_id = s.operation_type_id
    ${subtypeJoin}
    WHERE s.tape_id = $1
      AND ot.code = $2
    `,
    [tapeId, code]
  );

  return result.rows[0] || null;
}

async function listTapesForElectrodes(pool) {
  const result = await pool.query(`
    SELECT
      t.tape_id,
      t.name,
      t.project_id,
      r.role,
      r.name AS recipe_name,
      u.name AS created_by,
      TO_CHAR(coating_step.started_at, 'YYYY-MM-DD') AS finished_at,
      t.availability_status,
      coating_step.coating_sidedness

    FROM tapes t

    JOIN tape_recipes r
      ON r.tape_recipe_id = t.tape_recipe_id

    LEFT JOIN users u
      ON u.user_id = t.created_by

    JOIN LATERAL (
      SELECT
        ps.started_at,
        c.coating_sidedness
      FROM tape_process_steps ps
      JOIN operation_types ot
        ON ot.operation_type_id = ps.operation_type_id
      JOIN tape_step_coating c
        ON c.step_id = ps.step_id
      WHERE ps.tape_id = t.tape_id
        AND ot.code = 'coating'
      ORDER BY ps.started_at DESC NULLS LAST, ps.step_id DESC
      LIMIT 1
    ) coating_step ON TRUE

    WHERE t.availability_status IS DISTINCT FROM 'depleted'

    ORDER BY coating_step.started_at DESC NULLS LAST, t.tape_id DESC;
  `);

  return attachTapeProjects(pool, result.rows);
}

async function listElectrodeCutBatchesByTape(pool, tapeId) {
  const result = await pool.query(
    `
    SELECT
      b.*,
      (
        SELECT c.coating_sidedness
        FROM tape_process_steps ts_coating
        JOIN operation_types ot_coating
          ON ot_coating.operation_type_id = ts_coating.operation_type_id
        JOIN tape_step_coating c
          ON c.step_id = ts_coating.step_id
        WHERE ts_coating.tape_id = b.tape_id
          AND ot_coating.code = 'coating'
        LIMIT 1
      ) AS tape_coating_sidedness,
      u_created.name AS created_by_name,
      u_updated.name AS updated_by_name,
      d.start_time AS drying_start,
      d.end_time AS drying_end,
      COALESCE(ec.electrode_count, 0) AS electrode_count
    FROM electrode_cut_batches b
    LEFT JOIN users u_created
      ON u_created.user_id = b.created_by
    LEFT JOIN users u_updated
      ON u_updated.user_id = b.updated_by
    LEFT JOIN electrode_drying d
      ON d.cut_batch_id = b.cut_batch_id
    LEFT JOIN (
      SELECT
        cut_batch_id,
        COUNT(*) AS electrode_count
      FROM electrodes
      GROUP BY cut_batch_id
    ) ec
      ON ec.cut_batch_id = b.cut_batch_id
    WHERE b.tape_id = $1
    ORDER BY b.created_at DESC, b.cut_batch_id DESC
    `,
    [tapeId]
  );

  return attachElectrodeBatchProjects(pool, result.rows);
}

async function getTapeReport(pool, tapeId) {
  const [tapeResult, recipeLinesResult, stepsResult, dryBoxStateResult, statusMap] = await Promise.all([
    pool.query(
      `
      SELECT
        t.tape_id,
        t.name,
        t.project_id,
        t.tape_recipe_id,
        t.created_by,
        t.created_at,
        t.updated_at,
        t.status,
        t.notes,
        t.calc_mode,
        t.target_mass_g,
        r.role,
        r.name AS recipe_name,
        p.name AS project_name,
        u.name AS created_by_name
      FROM tapes t
      LEFT JOIN tape_recipes r
        ON r.tape_recipe_id = t.tape_recipe_id
      LEFT JOIN projects p
        ON p.project_id = t.project_id
      LEFT JOIN users u
        ON u.user_id = t.created_by
      WHERE t.tape_id = $1
      `,
      [tapeId]
    ),
    pool.query(
      `
      SELECT
        rl.recipe_line_id,
        rl.material_id,
        m.name AS material_name,
        rl.recipe_role,
        rl.include_in_pct,
        rl.slurry_percent,
        rl.line_notes,
        a.actual_id,
        a.material_instance_id,
        mi.name AS instance_name,
        a.measure_mode,
        a.actual_mass_g,
        a.actual_volume_ml,
        mp.density_g_ml,
        a.recorded_at
      FROM tapes t
      JOIN tape_recipe_lines rl
        ON rl.tape_recipe_id = t.tape_recipe_id
      JOIN materials m
        ON m.material_id = rl.material_id
      LEFT JOIN tape_recipe_line_actuals a
        ON a.tape_id = t.tape_id
       AND a.recipe_line_id = rl.recipe_line_id
      LEFT JOIN material_instances mi
        ON mi.material_instance_id = a.material_instance_id
      LEFT JOIN material_properties mp
        ON mp.material_instance_id = a.material_instance_id
      WHERE t.tape_id = $1
      ORDER BY rl.recipe_line_id
      `,
      [tapeId]
    ),
    pool.query(
      `
      SELECT
        s.step_id,
        ot.code,
        s.performed_by,
        u.name AS performed_by_name,
        s.started_at,
        s.ended_at,
        s.comments,
        d.temperature_c,
        d.atmosphere,
        d.target_duration_min,
        d.drying_speed_text,
        d.other_parameters,
        mix.slurry_volume_ml,
        mix.dry_mixing_id,
        dm.description AS dry_mixing_label,
        mix.dry_start_time,
        mix.dry_duration_min,
        mix.dry_end_time,
        mix.dry_rpm,
        mix.wet_mixing_id,
        wm.description AS wet_mixing_label,
        mix.wet_start_time,
        mix.wet_duration_min,
        mix.wet_end_time,
        mix.wet_rpm,
        mix.viscosity_cp,
        c.foil_id,
        f.type AS foil_type,
        c.coating_id,
        c.coating_sidedness,
        COALESCE(cm.comments, cm.name) AS coating_method_label,
        c.gap_um,
        c.gap_um_side2,
        c.coat_temp_c,
        c.coat_time_min,
        c.method_comments,
        cal.temp_c,
        cal.pressure_value,
        cal.pressure_units,
        cal.draw_speed_m_min,
        cal.other_params,
        cal.init_thickness_microns,
        cal.final_thickness_microns,
        cal.no_passes,
        cal.appearance
      FROM tape_process_steps s
      JOIN operation_types ot
        ON ot.operation_type_id = s.operation_type_id
      LEFT JOIN users u
        ON u.user_id = s.performed_by
      LEFT JOIN tape_step_drying d
        ON d.step_id = s.step_id
      LEFT JOIN tape_step_mixing mix
        ON mix.step_id = s.step_id
      LEFT JOIN dry_mixing_methods dm
        ON dm.dry_mixing_id = mix.dry_mixing_id
      LEFT JOIN wet_mixing_methods wm
        ON wm.wet_mixing_id = mix.wet_mixing_id
      LEFT JOIN tape_step_coating c
        ON c.step_id = s.step_id
      LEFT JOIN foils f
        ON f.foil_id = c.foil_id
      LEFT JOIN coating_methods cm
        ON cm.coating_id = c.coating_id
      LEFT JOIN tape_step_calendering cal
        ON cal.step_id = s.step_id
      WHERE s.tape_id = $1
      `,
      [tapeId]
    ),
    pool.query(
      `
      SELECT
        ds.tape_id,
        ds.started_at,
        ds.removed_at,
        ds.temperature_c,
        ds.atmosphere,
        ds.other_parameters,
        ds.comments,
        ds.updated_by,
        ds.updated_at,
        t.availability_status,
        u.name AS updated_by_name
      FROM tapes t
      LEFT JOIN tape_dry_box_state ds
        ON ds.tape_id = t.tape_id
      LEFT JOIN users u
        ON u.user_id = ds.updated_by
      WHERE t.tape_id = $1
      `,
      [tapeId]
    ),
    fetchWorkflowStatusMap(pool, [tapeId])
  ]);

  if (tapeResult.rowCount === 0) {
    throw statusError('Лента не найдена', 404);
  }

  const [tape] = await attachTapeProjects(pool, tapeResult.rows);

  const selectedInstanceIds = recipeLinesResult.rows
    .map((row) => Number(row.material_instance_id))
    .filter((value) => Number.isInteger(value));

  const componentsByInstanceId = new Map();

  if (selectedInstanceIds.length) {
    const componentsResult = await pool.query(
      `
      WITH RECURSIVE component_tree AS (
        SELECT
          mic.material_instance_component_id,
          mic.parent_material_instance_id,
          mic.component_material_instance_id,
          mic.mass_fraction,
          ARRAY[
            mic.parent_material_instance_id,
            mic.component_material_instance_id
          ] AS path
        FROM material_instance_components mic
        WHERE mic.parent_material_instance_id = ANY($1::int[])

        UNION ALL

        SELECT
          mic.material_instance_component_id,
          mic.parent_material_instance_id,
          mic.component_material_instance_id,
          mic.mass_fraction,
          ct.path || mic.component_material_instance_id
        FROM material_instance_components mic
        JOIN component_tree ct
          ON mic.parent_material_instance_id = ct.component_material_instance_id
        WHERE NOT mic.component_material_instance_id = ANY(ct.path)
      )
      SELECT
        DISTINCT
        ct.material_instance_component_id,
        ct.parent_material_instance_id,
        ct.component_material_instance_id,
        mi.material_id,
        m.role AS material_role,
        ct.mass_fraction
      FROM component_tree ct
      JOIN material_instances mi
        ON mi.material_instance_id = ct.component_material_instance_id
      JOIN materials m
        ON m.material_id = mi.material_id
      ORDER BY ct.parent_material_instance_id, ct.material_instance_component_id
      `,
      [selectedInstanceIds]
    );

    componentsResult.rows.forEach((row) => {
      const instanceId = Number(row.parent_material_instance_id);
      if (!componentsByInstanceId.has(instanceId)) {
        componentsByInstanceId.set(instanceId, []);
      }
      componentsByInstanceId.get(instanceId).push({
        component_material_instance_id: Number(row.component_material_instance_id),
        material_id: Number(row.material_id),
        material_role: row.material_role || null,
        mass_fraction: Number(row.mass_fraction)
      });
    });
  }

  const stepOrder = new Map(
    WORKFLOW_STATUS_ORDER.map((step, index) => [step.code, index])
  );

  const steps = stepsResult.rows
    .slice()
    .sort(
      (a, b) =>
        (stepOrder.get(a.code) ?? Number.MAX_SAFE_INTEGER) -
        (stepOrder.get(b.code) ?? Number.MAX_SAFE_INTEGER)
    );

  return {
    tape,
    workflow_status: statusMap.get(tapeId) || null,
    recipe_lines: recipeLinesResult.rows,
    mixture_rows: computeTapeMixtureRows({
      tape,
      recipeLines: recipeLinesResult.rows,
      componentsByInstanceId
    }),
    steps,
    dry_box_state: dryBoxStateResult.rows[0] || null
  };
}

async function getTape(pool, id) {
  const [result, statusMap] = await Promise.all([
    pool.query(
      `
      SELECT
        t.tape_id,
        t.name,
        t.project_id,
        t.tape_recipe_id,
        t.created_by,
        t.created_at,
        t.status,
        t.availability_status,
        t.notes,
        t.calc_mode,
        t.target_mass_g,
        t.updated_by,
        t.updated_at,
        r.role,
        r.name AS recipe_name,
        p.name AS project_name,
        u_created.name AS created_by_name,
        u_updated.name AS updated_by_name
      FROM tapes t
      LEFT JOIN tape_recipes r ON r.tape_recipe_id = t.tape_recipe_id
      LEFT JOIN projects p ON p.project_id = t.project_id
      LEFT JOIN users u_created ON u_created.user_id = t.created_by
      LEFT JOIN users u_updated ON u_updated.user_id = t.updated_by
      WHERE t.tape_id = $1
      `,
      [id]
    ),
    fetchWorkflowStatusMap(pool, [id])
  ]);

  if (result.rowCount === 0) {
    throw statusError('Лента не найдена', 404);
  }

  const [tape] = await attachTapeProjects(pool, result.rows);

  return {
    ...tape,
    ...(statusMap.get(id) || defaultWorkflowStatus())
  };
}

module.exports = {
  getTape,
  getTapeReport,
  getTapeStepByCode,
  listElectrodeCutBatchesByTape,
  listTapesForElectrodes
};
