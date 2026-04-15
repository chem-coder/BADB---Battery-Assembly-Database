const express = require('express');
const router = express.Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');
const { trackChanges } = require('../middleware/trackChanges');

const WORKFLOW_STATUS_ORDER = [
  { code: 'recipe_materials', label: 'Выбор экземпляров' },
  { code: 'drying_am', label: 'Сушка активного материала' },
  { code: 'weighing', label: 'Замес пасты' },
  { code: 'mixing', label: 'Перемешивание' },
  { code: 'coating', label: 'Нанесение' },
  { code: 'drying_tape', label: 'Сушка ленты до каландрирования' },
  { code: 'calendering', label: 'Каландрирование' },
  { code: 'drying_pressed_tape', label: 'Сушка ленты после каландрирования' }
];

function isFilled(value) {
  return value !== null && value !== undefined && value !== '';
}

function hasSavedHeader(step) {
  return Boolean(step) && isFilled(step.performed_by) && isFilled(step.started_at);
}

/**
 * Audit-log a change on a tape process step (header + subtype fields combined).
 *
 * Called AFTER the upsert transaction commits so that audit failures never
 * break the primary save operation. Silently no-ops when oldValues is null
 * (i.e. first insert — nothing to track yet).
 *
 * @param {string} code            operation code: drying_am|drying_tape|drying_pressed_tape|weighing|mixing|coating|calendering
 * @param {string} subtypeTable    SQL table name (tape_step_drying etc.) — used only for the trackChanges tableName slot; updateMeta is false so the table itself is not written to
 * @param {number} stepId          tape_process_steps.step_id
 * @param {object|null} oldValues  row as returned by the pre-upsert SELECT, or null on insert
 * @param {object} newValues       flat object of fields being saved (normalized to null for empty)
 * @param {number} userId          req.user.userId
 */
async function auditStepChange(code, subtypeTable, stepId, oldValues, newValues, userId) {
  if (!oldValues) return;
  try {
    await trackChanges(
      pool,
      `tape_step_${code}`,
      subtypeTable,
      'step_id',
      stepId,
      oldValues,
      newValues,
      userId,
      null,
      false // updateMeta=false — step subtype tables have no updated_by/updated_at columns
    );
  } catch (err) {
    console.error(`trackChanges failed for ${code} step ${stepId}:`, err);
  }
}

function computeTapeWorkflowStatus({ recipeMeta, stepsByCode }) {
  const recipeComplete =
    recipeMeta.total_lines > 0 &&
    recipeMeta.selected_instance_lines >= recipeMeta.total_lines;

  const weighingActualsComplete =
    recipeMeta.required_actual_lines === 0 ||
    recipeMeta.filled_actual_lines >= recipeMeta.required_actual_lines;

  const completionMap = {
    recipe_materials: recipeComplete,
    drying_am: hasSavedHeader(stepsByCode.drying_am),
    weighing: hasSavedHeader(stepsByCode.weighing) && weighingActualsComplete,
    mixing: hasSavedHeader(stepsByCode.mixing),
    coating:
      hasSavedHeader(stepsByCode.coating) &&
      isFilled(stepsByCode.coating?.foil_id) &&
      isFilled(stepsByCode.coating?.coating_id) &&
      isFilled(stepsByCode.coating?.gap_um),
    drying_tape: hasSavedHeader(stepsByCode.drying_tape),
    calendering: hasSavedHeader(stepsByCode.calendering),
    drying_pressed_tape: hasSavedHeader(stepsByCode.drying_pressed_tape)
  };

  const firstIncomplete = WORKFLOW_STATUS_ORDER.find(
    ({ code }) => !completionMap[code]
  );

  if (firstIncomplete) {
    return {
      workflow_status_code: firstIncomplete.code,
      workflow_status_label: firstIncomplete.label,
      workflow_complete: false
    };
  }

  return {
    workflow_status_code: 'finished',
    workflow_status_label: 'Завершено',
    workflow_complete: true
  };
}

async function fetchWorkflowStatusMap(tapeIds) {
  const ids = (Array.isArray(tapeIds) ? tapeIds : [])
    .map(Number)
    .filter((id) => Number.isInteger(id));

  if (!ids.length) {
    return new Map();
  }

  const recipeResult = await pool.query(
    `
    SELECT
      t.tape_id,
      COUNT(rl.recipe_line_id) AS total_lines,
      COUNT(*) FILTER (
        WHERE a.material_instance_id IS NOT NULL
      ) AS selected_instance_lines,
      COUNT(*) FILTER (
        WHERE COALESCE(rl.include_in_pct, false) = true
      ) AS required_actual_lines,
      COUNT(*) FILTER (
        WHERE COALESCE(rl.include_in_pct, false) = true
          AND (
            a.actual_mass_g IS NOT NULL OR
            a.actual_volume_ml IS NOT NULL
          )
      ) AS filled_actual_lines
    FROM tapes t
    JOIN tape_recipe_lines rl
      ON rl.tape_recipe_id = t.tape_recipe_id
    LEFT JOIN tape_recipe_line_actuals a
      ON a.tape_id = t.tape_id
     AND a.recipe_line_id = rl.recipe_line_id
    WHERE t.tape_id = ANY($1::int[])
    GROUP BY t.tape_id
    `,
    [ids]
  );

  const stepsResult = await pool.query(
    `
    SELECT
      s.tape_id,
      ot.code,
      s.performed_by,
      s.started_at,
      c.foil_id,
      c.coating_id,
      c.gap_um
    FROM tape_process_steps s
    JOIN operation_types ot
      ON ot.operation_type_id = s.operation_type_id
    LEFT JOIN tape_step_coating c
      ON c.step_id = s.step_id
    WHERE s.tape_id = ANY($1::int[])
    `,
    [ids]
  );

  const recipeMetaByTapeId = new Map(
    recipeResult.rows.map((row) => [
      Number(row.tape_id),
      {
        total_lines: Number(row.total_lines) || 0,
        selected_instance_lines: Number(row.selected_instance_lines) || 0,
        required_actual_lines: Number(row.required_actual_lines) || 0,
        filled_actual_lines: Number(row.filled_actual_lines) || 0
      }
    ])
  );

  const stepsByTapeId = new Map();
  stepsResult.rows.forEach((row) => {
    const tapeId = Number(row.tape_id);
    if (!stepsByTapeId.has(tapeId)) {
      stepsByTapeId.set(tapeId, {});
    }
    stepsByTapeId.get(tapeId)[row.code] = row;
  });

  const statusMap = new Map();
  ids.forEach((tapeId) => {
    statusMap.set(
      tapeId,
      computeTapeWorkflowStatus({
        recipeMeta: recipeMetaByTapeId.get(tapeId) || {
          total_lines: 0,
          selected_instance_lines: 0,
          required_actual_lines: 0,
          filled_actual_lines: 0
        },
        stepsByCode: stepsByTapeId.get(tapeId) || {}
      })
    );
  });

  return statusMap;
}

router.get('/test', async (req, res) => {
  try {
    const result = await pool.query('SELECT 1 as ok');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database connection failed' });
  }
});



// --------  RECIPE LINE ACTUALS -------- 

// CREATE
router.post('/:id/actuals', auth, async (req, res) => {
  const tapeId = Number(req.params.id);

  if (!Number.isInteger(tapeId)) {
    return res.status(400).json({ error: 'Некорректный tape_id' });
  }

  const {
    recipe_line_id,
    material_instance_id,
    measure_mode,
    actual_mass_g,
    actual_volume_ml
  } = req.body;

  try {
    const result = await pool.query(
      `
      INSERT INTO tape_recipe_line_actuals (
        tape_id,
        recipe_line_id,
        material_instance_id,
        measure_mode,
        actual_mass_g,
        actual_volume_ml
      )
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (tape_id, recipe_line_id)
      DO UPDATE SET
        material_instance_id = EXCLUDED.material_instance_id,
        measure_mode = CASE
          WHEN EXCLUDED.measure_mode IS NULL
            AND EXCLUDED.actual_mass_g IS NULL
            AND EXCLUDED.actual_volume_ml IS NULL
          THEN tape_recipe_line_actuals.measure_mode
          ELSE EXCLUDED.measure_mode
        END,
        actual_mass_g = CASE
          WHEN EXCLUDED.measure_mode IS NULL
            AND EXCLUDED.actual_mass_g IS NULL
            AND EXCLUDED.actual_volume_ml IS NULL
          THEN tape_recipe_line_actuals.actual_mass_g
          ELSE EXCLUDED.actual_mass_g
        END,
        actual_volume_ml = CASE
          WHEN EXCLUDED.measure_mode IS NULL
            AND EXCLUDED.actual_mass_g IS NULL
            AND EXCLUDED.actual_volume_ml IS NULL
          THEN tape_recipe_line_actuals.actual_volume_ml
          ELSE EXCLUDED.actual_volume_ml
        END,
        recorded_at = now()
      RETURNING *
      `,
      [
        tapeId,
        recipe_line_id,
        material_instance_id,
        measure_mode,
        actual_mass_g,
        actual_volume_ml
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения фактических данных' });
  }
});

// READ
router.get('/:id/actuals', auth, async (req, res) => {
  const tapeId = Number(req.params.id);

  if (!Number.isInteger(tapeId)) {
    return res.status(400).json({ error: 'Некорректный tape_id' });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        a.actual_id,
        a.tape_id,
        a.recipe_line_id,
        a.material_instance_id,
        a.measure_mode,
        a.actual_mass_g,
        a.actual_volume_ml,
        a.recorded_at
      FROM tape_recipe_line_actuals a
      WHERE a.tape_id = $1
      ORDER BY a.recipe_line_id
      `,
      [tapeId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки фактических данных' });
  }
});



// -------- TAPES --------

// CREATE tape
router.post('/', auth, async (req, res) => {
  const {
    name,
    project_id,
    tape_recipe_id,
    created_by,
    notes,
    calc_mode,
    target_mass_g
  } = req.body;

  const projectId = project_id ? Number(project_id) : null;
  const recipeId  = tape_recipe_id ? Number(tape_recipe_id) : null;
  const createdBy = Number(created_by);

  if (!Number.isInteger(createdBy)) {
    return res.status(400).json({ error: 'Некорректные данные: created_by обязателен' });
  }
  if (project_id && !Number.isInteger(projectId)) {
    return res.status(400).json({ error: 'Некорректный project_id' });
  }
  if (tape_recipe_id && !Number.isInteger(recipeId)) {
    return res.status(400).json({ error: 'Некорректный tape_recipe_id' });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO tapes (
        name,
        project_id,
        tape_recipe_id,
        created_by,
        notes,
        calc_mode,
        target_mass_g
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
      `,
      [
        name,
        projectId,
        recipeId,
        createdBy,
        notes ?? null,
        calc_mode ?? null,
        target_mass_g ?? null
      ]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// READ
router.get('/', auth, async (req, res) => {
  const { role } = req.query;

  const baseQuery = `
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
      u_created.name AS created_by_name,
      t.updated_by,
      t.updated_at,
      u_updated.name AS updated_by_name,
      (
        SELECT string_agg(DISTINCT u.name, ', ' ORDER BY u.name)
        FROM tape_process_steps ts
        JOIN users u ON u.user_id = ts.performed_by
        WHERE ts.tape_id = t.tape_id
      ) AS operators,
      (
        SELECT COUNT(DISTINCT ot2.code)
        FROM tape_process_steps ts2
        JOIN operation_types ot2 ON ot2.operation_type_id = ts2.operation_type_id
        WHERE ts2.tape_id = t.tape_id
      ) AS completed_steps
    FROM tapes t
    LEFT JOIN tape_recipes r ON r.tape_recipe_id = t.tape_recipe_id
    LEFT JOIN projects p ON p.project_id = t.project_id
    LEFT JOIN users u_created ON u_created.user_id = t.created_by
    LEFT JOIN users u_updated ON u_updated.user_id = t.updated_by
  `;

  try {
    const result = role
      ? await pool.query(baseQuery + ' WHERE r.role = $1 ORDER BY t.created_at DESC', [role])
      : await pool.query(baseQuery + ' ORDER BY t.created_at DESC');

    const rows = result.rows || [];
    const statusMap = await fetchWorkflowStatusMap(rows.map((row) => row.tape_id));

    res.json(
      rows.map((row) => ({
        ...row,
        ...(statusMap.get(Number(row.tape_id)) || {
          workflow_status_code: 'recipe_materials',
          workflow_status_label: 'Выбор экземпляров',
          workflow_complete: false
        })
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// EDIT
router.put('/:id', auth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  const {
    name,
    project_id,
    tape_recipe_id,
    created_by,
    notes,
    calc_mode,
    target_mass_g
  } = req.body;

  const projectId = project_id ? Number(project_id) : null;
  const recipeId  = tape_recipe_id ? Number(tape_recipe_id) : null;
  const createdBy = Number(created_by);

  if (!Number.isInteger(createdBy)) {
    return res.status(400).json({ error: 'Некорректные данные: created_by обязателен' });
  }

  try {
    const current = await pool.query(
      'SELECT name, project_id, tape_recipe_id, created_by, notes, calc_mode, target_mass_g FROM tapes WHERE tape_id = $1',
      [id]
    );
    if (current.rowCount === 0) {
      return res.status(404).json({ error: 'Лента не найдена' });
    }

    const result = await pool.query(
      `
      UPDATE tapes
      SET
        name = $1,
        project_id = $2,
        tape_recipe_id = $3,
        created_by = $4,
        notes = $5,
        calc_mode = $6,
        target_mass_g = $7,
        updated_by = $8,
        updated_at = now()
      WHERE tape_id = $9
      RETURNING *
      `,
      [
        name,
        projectId,
        recipeId,
        createdBy,
        notes ?? null,
        calc_mode ?? null,
        target_mass_g ?? null,
        req.user.userId,
        id
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Лента не найдена' });
    }

    await trackChanges(pool, 'tape', 'tapes', 'tape_id', id,
      current.rows[0],
      { name, project_id: projectId, tape_recipe_id: recipeId, created_by: createdBy, notes: notes ?? null, calc_mode: calc_mode ?? null, target_mass_g: target_mass_g ?? null },
      req.user.userId
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления' });
  }
});

// DELETE
router.delete('/:id', auth, async (req, res) => {
  const id = Number(req.params.id);

  try {
    await pool.query(
      `DELETE FROM tapes WHERE tape_id = $1`,
      [id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});



// --------- GENERAL/GENERIC STEP READING (for any operation type) --------

// WRITE (dispatcher): POST /:id/steps/by-code/:code
router.post('/:id/steps/by-code/:code', auth, async (req, res) => {
  const tapeId = Number(req.params.id);
  const code = String(req.params.code || '').trim();

  if (!Number.isInteger(tapeId) || !code) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  // DRYING codes -> forward to existing drying save logic by duplicating the same SQL here
  if (code === 'drying_am' || code === 'drying_tape' || code === 'drying_pressed_tape') {
    const {
      performed_by,
      started_at,
      comments,
      temperature_c,
      atmosphere,
      target_duration_min,
      other_parameters
    } = req.body || {};

    const client = await pool.connect();
    let auditStepId = null;
    let auditOldValues = null;
    let auditNewValues = null;
    try {
      await client.query('BEGIN');

      // 1) lookup operation_type_id by code
      const ot = await client.query(
        `SELECT operation_type_id FROM operation_types WHERE code = $1`,
        [code]
      );
      if (ot.rows.length === 0) {
        throw new Error(`Unknown operation code: ${code}`);
      }
      const operationTypeId = ot.rows[0].operation_type_id;

      // 2) read previous state (for audit) BEFORE upsert — null row means this is an insert
      const prevRes = await client.query(
        `
        SELECT ps.performed_by, ps.started_at, ps.comments,
               sub.temperature_c, sub.atmosphere, sub.target_duration_min, sub.other_parameters
        FROM tape_process_steps ps
        LEFT JOIN tape_step_drying sub ON sub.step_id = ps.step_id
        WHERE ps.tape_id = $1 AND ps.operation_type_id = $2
        `,
        [tapeId, operationTypeId]
      );
      auditOldValues = prevRes.rows[0] || null;

      // 3) upsert base step (unique: tape_id + operation_type_id)
      const step = await client.query(
        `
        INSERT INTO tape_process_steps (tape_id, operation_type_id, performed_by, started_at, comments)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (tape_id, operation_type_id)
        DO UPDATE SET
          performed_by = EXCLUDED.performed_by,
          started_at   = EXCLUDED.started_at,
          comments     = EXCLUDED.comments
        RETURNING step_id
        `,
        [
          tapeId,
          operationTypeId,
          Number(performed_by) || null,
          started_at || null,
          comments || null
        ]
      );

      const stepId = step.rows[0].step_id;
      auditStepId = stepId;

      // 4) upsert drying subtype
      await client.query(
        `
        INSERT INTO tape_step_drying
          (step_id, temperature_c, atmosphere, target_duration_min, other_parameters)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (step_id)
        DO UPDATE SET
          temperature_c = EXCLUDED.temperature_c,
          atmosphere = EXCLUDED.atmosphere,
          target_duration_min = EXCLUDED.target_duration_min,
          other_parameters = EXCLUDED.other_parameters
        `,
        [
          stepId,
          Number.isFinite(Number(temperature_c)) ? Number(temperature_c) : null,
          atmosphere || null,
          Number.isFinite(Number(target_duration_min)) ? Number(target_duration_min) : null,
          other_parameters || null
        ]
      );

      // 5) build audit payload (same normalization as the INSERT params above)
      auditNewValues = {
        performed_by: Number(performed_by) || null,
        started_at: started_at || null,
        comments: comments || null,
        temperature_c: Number.isFinite(Number(temperature_c)) ? Number(temperature_c) : null,
        atmosphere: atmosphere || null,
        target_duration_min: Number.isFinite(Number(target_duration_min)) ? Number(target_duration_min) : null,
        other_parameters: other_parameters || null
      };

      await client.query('COMMIT');
      // 6) best-effort audit AFTER commit — failures don't break the save
      await auditStepChange(code, 'tape_step_drying', auditStepId, auditOldValues, auditNewValues, req.user.userId);
      return res.status(201).json({ step_id: stepId });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(err);
      return res.status(500).json({ error: 'Failed to save drying step' });
    } finally {
      client.release();
    }
  }

  // WEIGHING (header only, no subtype table)
  if (code === 'weighing') {
    const {
      performed_by,
      started_at,
      comments
    } = req.body || {};

    const client = await pool.connect();
    let auditStepId = null;
    let auditOldValues = null;
    let auditNewValues = null;
    try {
      await client.query('BEGIN');

      const ot = await client.query(
        `SELECT operation_type_id FROM operation_types WHERE code = $1`,
        [code]
      );

      if (ot.rows.length === 0) {
        throw new Error(`Unknown operation code: ${code}`);
      }

      const operationTypeId = ot.rows[0].operation_type_id;

      // read previous state (for audit) BEFORE upsert — header-only, no subtype join
      const prevRes = await client.query(
        `
        SELECT performed_by, started_at, comments
        FROM tape_process_steps
        WHERE tape_id = $1 AND operation_type_id = $2
        `,
        [tapeId, operationTypeId]
      );
      auditOldValues = prevRes.rows[0] || null;

      const step = await client.query(
        `
        INSERT INTO tape_process_steps
          (tape_id, operation_type_id, performed_by, started_at, comments)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (tape_id, operation_type_id)
        DO UPDATE SET
          performed_by = EXCLUDED.performed_by,
          started_at   = EXCLUDED.started_at,
          comments     = EXCLUDED.comments
        RETURNING step_id
        `,
        [
          tapeId,
          operationTypeId,
          Number(performed_by) || null,
          started_at || null,
          comments || null
        ]
      );

      auditStepId = step.rows[0].step_id;
      auditNewValues = {
        performed_by: Number(performed_by) || null,
        started_at: started_at || null,
        comments: comments || null
      };

      await client.query('COMMIT');
      // best-effort audit AFTER commit (no subtype table — use tape_process_steps)
      await auditStepChange(code, 'tape_process_steps', auditStepId, auditOldValues, auditNewValues, req.user.userId);
      return res.status(201).json({ step_id: auditStepId });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error(err);
      return res.status(500).json({ error: 'Failed to save weighing step' });
    } finally {
      client.release();
    }
  }

  // MIXING (header + tape_step_mixing)
  if (code === 'mixing') {
    const {
      performed_by,
      started_at,
      comments,
      slurry_volume_ml,
      dry_mixing_id,
      dry_start_time,
      dry_duration_min,
      dry_rpm,
      wet_mixing_id,
      wet_start_time,
      wet_duration_min,
      wet_rpm,
      viscosity_cP
    } = req.body || {};

    const client = await pool.connect();
    let auditStepId = null;
    let auditOldValues = null;
    let auditNewValues = null;
    try {
      await client.query('BEGIN');

      // 1) lookup operation_type_id by code
      const ot = await client.query(
        `SELECT operation_type_id FROM operation_types WHERE code = $1`,
        [code]
      );
      if (ot.rows.length === 0) {
        throw new Error(`Unknown operation code: ${code}`);
      }
      const operationTypeId = ot.rows[0].operation_type_id;

      // 2) read previous state (for audit) BEFORE upsert
      // NOTE: viscosity_cP is stored as lowercase `viscosity_cp` because the
      // INSERT uses unquoted identifier, which Postgres folds to lowercase.
      const prevRes = await client.query(
        `
        SELECT ps.performed_by, ps.started_at, ps.comments,
               sub.slurry_volume_ml,
               sub.dry_mixing_id, sub.dry_start_time, sub.dry_duration_min, sub.dry_rpm,
               sub.wet_mixing_id, sub.wet_start_time, sub.wet_duration_min, sub.wet_rpm,
               sub.viscosity_cp
        FROM tape_process_steps ps
        LEFT JOIN tape_step_mixing sub ON sub.step_id = ps.step_id
        WHERE ps.tape_id = $1 AND ps.operation_type_id = $2
        `,
        [tapeId, operationTypeId]
      );
      auditOldValues = prevRes.rows[0] || null;

      // 3) upsert base step
      const step = await client.query(
        `
        INSERT INTO tape_process_steps (tape_id, operation_type_id, performed_by, started_at, comments)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (tape_id, operation_type_id)
        DO UPDATE SET
          performed_by = EXCLUDED.performed_by,
          started_at   = EXCLUDED.started_at,
          comments     = EXCLUDED.comments
        RETURNING step_id
        `,
        [
          tapeId,
          operationTypeId,
          Number(performed_by) || null,
          started_at || null,
          comments || null
        ]
      );

      const stepId = step.rows[0].step_id;

      // 3) upsert mixing subtype
      await client.query(
        `
        INSERT INTO tape_step_mixing
          (step_id, slurry_volume_ml,
          dry_mixing_id, dry_start_time, dry_duration_min, dry_rpm,
          wet_mixing_id, wet_start_time, wet_duration_min, wet_rpm,
          viscosity_cP)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (step_id)
        DO UPDATE SET
          slurry_volume_ml  = EXCLUDED.slurry_volume_ml,
          dry_mixing_id     = EXCLUDED.dry_mixing_id,
          dry_start_time    = EXCLUDED.dry_start_time,
          dry_duration_min  = EXCLUDED.dry_duration_min,
          dry_rpm           = EXCLUDED.dry_rpm,
          wet_mixing_id     = EXCLUDED.wet_mixing_id,
          wet_start_time    = EXCLUDED.wet_start_time,
          wet_duration_min  = EXCLUDED.wet_duration_min,
          wet_rpm           = EXCLUDED.wet_rpm,
          viscosity_cP      = EXCLUDED.viscosity_cP
        `,
        [
          stepId,
          Number.isFinite(Number(slurry_volume_ml)) ? Number(slurry_volume_ml) : null,

          Number(dry_mixing_id) || null,
          dry_start_time || null,
          Number.isFinite(Number(dry_duration_min)) ? Number(dry_duration_min) : null,
          dry_rpm || null,

          Number(wet_mixing_id) || null,
          wet_start_time || null,
          Number.isFinite(Number(wet_duration_min)) ? Number(wet_duration_min) : null,
          wet_rpm || null,

          Number.isFinite(Number(viscosity_cP)) ? Number(viscosity_cP) : null
        ]
      );

      auditStepId = stepId;
      auditNewValues = {
        performed_by: Number(performed_by) || null,
        started_at: started_at || null,
        comments: comments || null,
        slurry_volume_ml: Number.isFinite(Number(slurry_volume_ml)) ? Number(slurry_volume_ml) : null,
        dry_mixing_id: Number(dry_mixing_id) || null,
        dry_start_time: dry_start_time || null,
        dry_duration_min: Number.isFinite(Number(dry_duration_min)) ? Number(dry_duration_min) : null,
        dry_rpm: dry_rpm || null,
        wet_mixing_id: Number(wet_mixing_id) || null,
        wet_start_time: wet_start_time || null,
        wet_duration_min: Number.isFinite(Number(wet_duration_min)) ? Number(wet_duration_min) : null,
        wet_rpm: wet_rpm || null,
        // key is lowercased to match Postgres-normalized column name
        viscosity_cp: Number.isFinite(Number(viscosity_cP)) ? Number(viscosity_cP) : null
      };

      await client.query('COMMIT');
      await auditStepChange(code, 'tape_step_mixing', auditStepId, auditOldValues, auditNewValues, req.user.userId);
      return res.status(201).json({ step_id: stepId });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error(err);
      return res.status(500).json({ error: 'Failed to save mixing step' });
    } finally {
      client.release();
    }
  }

  // COATING (header + tape_step_coating)
  if (code === 'coating') {
    const {
      performed_by,
      started_at,
      comments,
      foil_id,
      coating_id,
      gap_um,
      coat_temp_c,
      coat_time_min,
      method_comments
    } = req.body || {};

    const client = await pool.connect();
    let auditStepId = null;
    let auditOldValues = null;
    let auditNewValues = null;

    try {
      await client.query('BEGIN');

      // 1) lookup operation_type_id
      const ot = await client.query(
        `SELECT operation_type_id FROM operation_types WHERE code = $1`,
        [code]
      );

      if (ot.rows.length === 0) {
        throw new Error(`Unknown operation code: ${code}`);
      }

      const operationTypeId = ot.rows[0].operation_type_id;

      // 2) read previous state (for audit) BEFORE upsert
      const prevRes = await client.query(
        `
        SELECT ps.performed_by, ps.started_at, ps.comments,
               sub.foil_id, sub.coating_id, sub.gap_um,
               sub.coat_temp_c, sub.coat_time_min, sub.method_comments
        FROM tape_process_steps ps
        LEFT JOIN tape_step_coating sub ON sub.step_id = ps.step_id
        WHERE ps.tape_id = $1 AND ps.operation_type_id = $2
        `,
        [tapeId, operationTypeId]
      );
      auditOldValues = prevRes.rows[0] || null;

      // 3) upsert base step
      const step = await client.query(
        `
        INSERT INTO tape_process_steps
          (tape_id, operation_type_id, performed_by, started_at, comments)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (tape_id, operation_type_id)
        DO UPDATE SET
          performed_by = EXCLUDED.performed_by,
          started_at   = EXCLUDED.started_at,
          comments     = EXCLUDED.comments
        RETURNING step_id
        `,
        [
          tapeId,
          operationTypeId,
          Number(performed_by) || null,
          started_at || null,
          comments || null
        ]
      );

      const stepId = step.rows[0].step_id;

      // 3) upsert coating subtype
      await client.query(
        `
        INSERT INTO tape_step_coating
          (step_id, foil_id, coating_id, gap_um, coat_temp_c, coat_time_min, method_comments)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (step_id)
        DO UPDATE SET
          foil_id = EXCLUDED.foil_id,
          coating_id = EXCLUDED.coating_id,
          gap_um = EXCLUDED.gap_um,
          coat_temp_c = EXCLUDED.coat_temp_c,
          coat_time_min = EXCLUDED.coat_time_min,
          method_comments = EXCLUDED.method_comments
        `,
        [
          stepId,
          Number(foil_id) || null,
          Number(coating_id) || null,
          Number.isFinite(Number(gap_um)) ? Number(gap_um) : null,
          Number.isFinite(Number(coat_temp_c)) ? Number(coat_temp_c) : null,
          Number.isFinite(Number(coat_time_min)) ? Number(coat_time_min) : null,
          method_comments || null
        ]
      );

      auditStepId = stepId;
      auditNewValues = {
        performed_by: Number(performed_by) || null,
        started_at: started_at || null,
        comments: comments || null,
        foil_id: Number(foil_id) || null,
        coating_id: Number(coating_id) || null,
        gap_um: Number.isFinite(Number(gap_um)) ? Number(gap_um) : null,
        coat_temp_c: Number.isFinite(Number(coat_temp_c)) ? Number(coat_temp_c) : null,
        coat_time_min: Number.isFinite(Number(coat_time_min)) ? Number(coat_time_min) : null,
        method_comments: method_comments || null
      };

      await client.query('COMMIT');
      await auditStepChange(code, 'tape_step_coating', auditStepId, auditOldValues, auditNewValues, req.user.userId);
      return res.status(201).json({ step_id: stepId });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error(err);
      return res.status(500).json({ error: 'Failed to save coating step' });
    } finally {
      client.release();
    }
  }

  // CALENDERING (header + tape_step_calendering)
  if (code === 'calendering') {
    const {
      performed_by,
      started_at,
      comments,
      temp_c,
      pressure_value,
      pressure_units,
      draw_speed_m_min,
      other_params,
      init_thickness_microns,
      final_thickness_microns,
      no_passes,
      appearance
    } = req.body || {};

    const client = await pool.connect();
    let auditStepId = null;
    let auditOldValues = null;
    let auditNewValues = null;

    try {
      await client.query('BEGIN');

      // 1) lookup operation_type_id
      const ot = await client.query(
        `SELECT operation_type_id FROM operation_types WHERE code = $1`,
        [code]
      );

      if (ot.rows.length === 0) {
        throw new Error(`Unknown operation code: ${code}`);
      }

      const operationTypeId = ot.rows[0].operation_type_id;

      // 2) read previous state (for audit) BEFORE upsert
      const prevRes = await client.query(
        `
        SELECT ps.performed_by, ps.started_at, ps.comments,
               sub.temp_c, sub.pressure_value, sub.pressure_units,
               sub.draw_speed_m_min, sub.other_params,
               sub.init_thickness_microns, sub.final_thickness_microns,
               sub.no_passes, sub.appearance
        FROM tape_process_steps ps
        LEFT JOIN tape_step_calendering sub ON sub.step_id = ps.step_id
        WHERE ps.tape_id = $1 AND ps.operation_type_id = $2
        `,
        [tapeId, operationTypeId]
      );
      auditOldValues = prevRes.rows[0] || null;

      // 3) upsert base step
      const step = await client.query(
        `
        INSERT INTO tape_process_steps
          (tape_id, operation_type_id, performed_by, started_at, comments)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (tape_id, operation_type_id)
        DO UPDATE SET
          performed_by = EXCLUDED.performed_by,
          started_at   = EXCLUDED.started_at,
          comments     = EXCLUDED.comments
        RETURNING step_id
        `,
        [
          tapeId,
          operationTypeId,
          Number(performed_by) || null,
          started_at || null,
          comments || null
        ]
      );

      const stepId = step.rows[0].step_id;

      // 3) upsert calendering subtype
      await client.query(
        `
        INSERT INTO tape_step_calendering (
          step_id,
          temp_c,
          pressure_value,
          pressure_units,
          draw_speed_m_min,
          other_params,
          init_thickness_microns,
          final_thickness_microns,
          no_passes,
          appearance
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (step_id)
        DO UPDATE SET
          temp_c = EXCLUDED.temp_c,
          pressure_value = EXCLUDED.pressure_value,
          pressure_units = EXCLUDED.pressure_units,
          draw_speed_m_min = EXCLUDED.draw_speed_m_min,
          other_params = EXCLUDED.other_params,
          init_thickness_microns = EXCLUDED.init_thickness_microns,
          final_thickness_microns = EXCLUDED.final_thickness_microns,
          no_passes = EXCLUDED.no_passes,
          appearance = EXCLUDED.appearance
        `,
        [
          stepId,
          Number.isFinite(Number(temp_c)) ? Number(temp_c) : null,
          Number.isFinite(Number(pressure_value)) ? Number(pressure_value) : null,
          pressure_units || null,
          Number.isFinite(Number(draw_speed_m_min)) ? Number(draw_speed_m_min) : null,
          other_params || null,
          Number.isFinite(Number(init_thickness_microns)) ? Number(init_thickness_microns) : null,
          Number.isFinite(Number(final_thickness_microns)) ? Number(final_thickness_microns) : null,
          Number.isFinite(Number(no_passes)) ? Number(no_passes) : null,
          appearance || null
        ]
      );

      auditStepId = stepId;
      auditNewValues = {
        performed_by: Number(performed_by) || null,
        started_at: started_at || null,
        comments: comments || null,
        temp_c: Number.isFinite(Number(temp_c)) ? Number(temp_c) : null,
        pressure_value: Number.isFinite(Number(pressure_value)) ? Number(pressure_value) : null,
        pressure_units: pressure_units || null,
        draw_speed_m_min: Number.isFinite(Number(draw_speed_m_min)) ? Number(draw_speed_m_min) : null,
        other_params: other_params || null,
        init_thickness_microns: Number.isFinite(Number(init_thickness_microns)) ? Number(init_thickness_microns) : null,
        final_thickness_microns: Number.isFinite(Number(final_thickness_microns)) ? Number(final_thickness_microns) : null,
        no_passes: Number.isFinite(Number(no_passes)) ? Number(no_passes) : null,
        appearance: appearance || null
      };

      await client.query('COMMIT');
      await auditStepChange(code, 'tape_step_calendering', auditStepId, auditOldValues, auditNewValues, req.user.userId);
      return res.status(201).json({ step_id: stepId });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error(err);
      return res.status(500).json({ error: 'Failed to save calendering step' });
    } finally {
      client.release();
    }
  }

  return res.status(501).json({ error: `No saver implemented for code: ${code}` });
});

// READ
router.get('/:id/steps/by-code/:code', auth, async (req, res) => {
  const tapeId = Number(req.params.id);
  const code = String(req.params.code || '').trim();

  if (!Number.isInteger(tapeId) || !code) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  try {
    // Determine subtype join
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
        m.dry_rpm,
        m.wet_mixing_id,
        m.wet_start_time,
        m.wet_duration_min,
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
        c.gap_um,
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

    res.json(result.rows[0] || null);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load step' });
  }
});



// -------- TAPES FOR ELECTRODE CUTTING DROPDOWN --------

router.get('/for-electrodes', auth, async (req, res) => {

  try {

    const result = await pool.query(`
      SELECT
        t.tape_id,
        t.name,
        t.project_id,
        r.role,
        r.name AS recipe_name,
        u.name AS created_by,
        TO_CHAR(MAX(ps.started_at), 'YYYY-MM-DD') AS finished_at

      FROM tapes t

      JOIN tape_recipes r
        ON r.tape_recipe_id = t.tape_recipe_id

      LEFT JOIN users u
        ON u.user_id = t.created_by

      LEFT JOIN tape_process_steps ps
        ON ps.tape_id = t.tape_id

      LEFT JOIN tape_step_drying sd
        ON sd.step_id = ps.step_id

      WHERE sd.step_id IS NOT NULL

      GROUP BY
        t.tape_id,
        t.name,
        t.project_id,
        r.role,
        r.name,
        u.name

      ORDER BY finished_at DESC NULLS LAST, t.tape_id DESC;
    `);

    res.json(result.rows);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });

  }

});



// -------- ELECTRODE CUT BATCHES BY TAPE --------

// GET cut batches by tape
router.get('/:id/electrode-cut-batches', auth, async (req, res) => {
  const tapeId = Number(req.params.id);

  if (!Number.isInteger(tapeId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        b.*,
        d.start_time AS drying_start,
        d.end_time AS drying_end,
        COALESCE(ec.electrode_count, 0) AS electrode_count
      FROM electrode_cut_batches b
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

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});



// READ ONE — must be after /for-electrodes to avoid /:id catching "for-electrodes"
router.get('/:id', auth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        t.tape_id,
        t.name,
        t.project_id,
        t.tape_recipe_id,
        t.created_by,
        t.created_at,
        t.status,
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
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Лента не найдена' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
