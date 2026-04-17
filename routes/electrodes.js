const express = require('express');
const router = express.Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');
const { trackChanges } = require('../middleware/trackChanges');

const ALLOWED_TARGET_FORM_FACTORS = new Set(['coin', 'pouch', 'cylindrical']);
const ALLOWED_TARGET_CONFIG_CODES = new Set([
  '2016',
  '2025',
  '2032',
  '103x83',
  '86x56',
  '18650',
  '21700',
  'other'
]);

const TARGET_CONFIG_CODES_BY_FORM_FACTOR = {
  coin: new Set(['2016', '2025', '2032', 'other']),
  pouch: new Set(['103x83', '86x56', 'other']),
  cylindrical: new Set(['18650', '21700', 'other'])
};

function normalizeCutBatchGeometry({
  target_form_factor,
  target_config_code,
  target_config_other,
  shape,
  diameter_mm,
  length_mm,
  width_mm
}) {
  const normalizedTargetFormFactor = target_form_factor || null;
  const normalizedTargetConfigCode = target_config_code || null;
  const normalizedTargetConfigOther = target_config_other?.trim() || null;
  const normalizedShape =
    normalizedTargetFormFactor === 'coin' ? 'circle'
    : normalizedTargetFormFactor === 'pouch' || normalizedTargetFormFactor === 'cylindrical' ? 'rectangle'
    : (shape || null);
  const normalizedDiameter = diameter_mm != null && diameter_mm !== '' ? Number(diameter_mm) : null;
  const normalizedLength = length_mm != null && length_mm !== '' ? Number(length_mm) : null;
  const normalizedWidth = width_mm != null && width_mm !== '' ? Number(width_mm) : null;
  if (normalizedShape && !['circle', 'rectangle'].includes(normalizedShape)) {
    return { error: 'Некорректная форма электрода' };
  }

  if (!normalizedTargetFormFactor || !ALLOWED_TARGET_FORM_FACTORS.has(normalizedTargetFormFactor)) {
    return { error: 'Необходимо выбрать семейство элемента' };
  }

  if (!normalizedTargetConfigCode || !ALLOWED_TARGET_CONFIG_CODES.has(normalizedTargetConfigCode)) {
    return { error: 'Необходимо выбрать конфигурацию элемента' };
  }

  if (!TARGET_CONFIG_CODES_BY_FORM_FACTOR[normalizedTargetFormFactor].has(normalizedTargetConfigCode)) {
    return { error: 'Конфигурация не соответствует выбранному семейству элемента' };
  }

  if (
    normalizedTargetConfigCode === 'other' &&
    !normalizedTargetConfigOther
  ) {
    return { error: 'Для конфигурации other необходимо заполнить пояснение' };
  }

  if (normalizedDiameter != null && (!Number.isFinite(normalizedDiameter) || normalizedDiameter <= 0)) {
    return { error: 'Диаметр должен быть положительным числом' };
  }

  if (normalizedLength != null && (!Number.isFinite(normalizedLength) || normalizedLength <= 0)) {
    return { error: 'Длина должна быть положительным числом' };
  }

  if (normalizedWidth != null && (!Number.isFinite(normalizedWidth) || normalizedWidth <= 0)) {
    return { error: 'Ширина должна быть положительным числом' };
  }

  if (normalizedShape === 'circle') {
    if (normalizedDiameter == null) {
      return { error: 'Для круглого электрода необходимо указать диаметр' };
    }

    if (normalizedLength != null || normalizedWidth != null) {
      return { error: 'Для круглого электрода нельзя указывать длину и ширину' };
    }

    if (normalizedTargetFormFactor !== 'coin') {
      return { error: 'Круглый электрод может относиться только к монеточному элементу' };
    }
  }

  if (normalizedShape === 'rectangle') {
    if (normalizedLength == null || normalizedWidth == null) {
      return { error: 'Для прямоугольного электрода необходимо указать длину и ширину' };
    }

    if (normalizedDiameter != null) {
      return { error: 'Для прямоугольного электрода нельзя указывать диаметр' };
    }

    if (!['pouch', 'cylindrical'].includes(normalizedTargetFormFactor)) {
      return { error: 'Прямоугольный электрод может относиться только к pouch или cylindrical' };
    }
  }

  return {
    target_form_factor: normalizedTargetFormFactor,
    target_config_code: normalizedTargetConfigCode,
    target_config_other: normalizedTargetConfigOther,
    shape: normalizedShape,
    diameter_mm: normalizedDiameter,
    length_mm: normalizedLength,
    width_mm: normalizedWidth
  };
}

router.get('/test', async (req, res) => {
  const result = await pool.query('SELECT 1 as ok');
  res.json(result.rows);
});

router.get('/electrode-cut-batches', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        b.*,
        t.name AS tape_name,
        t.project_id,
        p.name AS project_name,
        r.role AS tape_role,
        u_created.name AS created_by_name,
        u_updated.name AS updated_by_name,
        d.start_time AS drying_start,
        d.end_time AS drying_end,
        COALESCE(ec.electrode_count, 0) AS electrode_count
      FROM electrode_cut_batches b
      JOIN tapes t
        ON t.tape_id = b.tape_id
      LEFT JOIN projects p
        ON p.project_id = t.project_id
      LEFT JOIN tape_recipes r
        ON r.tape_recipe_id = t.tape_recipe_id
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
      ORDER BY b.created_at DESC, b.cut_batch_id DESC
      `
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});



// -------- ELECTRODE CUT BATCHES --------
// CREATE cut batch
router.post('/electrode-cut-batches', auth, async (req, res) => {
  const {
    tape_id,
    created_by,
    target_form_factor,
    target_config_code,
    target_config_other,
    shape,
    diameter_mm,
    length_mm,
    width_mm,
    comments
  } = req.body;

  const tapeId = Number(tape_id);
  const createdBy = Number(created_by);

  if (!Number.isInteger(tapeId) || !Number.isInteger(createdBy)) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  const geometry = normalizeCutBatchGeometry({
    target_form_factor,
    target_config_code,
    target_config_other,
    shape,
    diameter_mm,
    length_mm,
    width_mm
  });

  if (geometry.error) {
    return res.status(400).json({ error: geometry.error });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const tapeResult = await client.query(
      `
      SELECT tape_id, availability_status
      FROM tapes
      WHERE tape_id = $1
      `,
      [tapeId]
    );

    if (!tapeResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Лента не найдена' });
    }

    if (tapeResult.rows[0].availability_status === 'depleted') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Лента отмечена как израсходованная' });
    }

    const result = await client.query(
      `
      INSERT INTO electrode_cut_batches (
        tape_id,
        created_by,
        target_form_factor,
        target_config_code,
        target_config_other,
        shape,
        diameter_mm,
        length_mm,
        width_mm,
        comments
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
      `,
      [
        tapeId,
        createdBy,
        geometry.target_form_factor,
        geometry.target_config_code,
        geometry.target_config_other,
        geometry.shape,
        geometry.diameter_mm,
        geometry.length_mm,
        geometry.width_mm,
        comments || null
      ]
    );

    await client.query(
      `
      INSERT INTO tape_dry_box_state (
        tape_id,
        started_at,
        removed_at,
        temperature_c,
        atmosphere,
        other_parameters,
        comments,
        updated_by,
        updated_at
      )
      SELECT
        $1,
        COALESCE(ds.started_at, final_dry.started_at, now()),
        now(),
        COALESCE(ds.temperature_c, final_dry.temperature_c),
        COALESCE(ds.atmosphere, final_dry.atmosphere),
        COALESCE(ds.other_parameters, final_dry.other_parameters),
        ds.comments,
        $2,
        now()
      FROM (SELECT 1) seed
      LEFT JOIN tape_dry_box_state ds
        ON ds.tape_id = $1
      LEFT JOIN LATERAL (
        SELECT
          s.started_at,
          d.temperature_c,
          d.atmosphere,
          d.other_parameters
        FROM tape_process_steps s
        JOIN operation_types ot
          ON ot.operation_type_id = s.operation_type_id
        LEFT JOIN tape_step_drying d
          ON d.step_id = s.step_id
        WHERE s.tape_id = $1
          AND ot.code = 'drying_pressed_tape'
        ORDER BY s.started_at DESC NULLS LAST, s.step_id DESC
        LIMIT 1
      ) final_dry ON TRUE
      ON CONFLICT (tape_id)
      DO UPDATE SET
        started_at = COALESCE(tape_dry_box_state.started_at, EXCLUDED.started_at),
        removed_at = EXCLUDED.removed_at,
        temperature_c = COALESCE(tape_dry_box_state.temperature_c, EXCLUDED.temperature_c),
        atmosphere = COALESCE(tape_dry_box_state.atmosphere, EXCLUDED.atmosphere),
        other_parameters = COALESCE(tape_dry_box_state.other_parameters, EXCLUDED.other_parameters),
        updated_by = EXCLUDED.updated_by,
        updated_at = now()
      `,
      [tapeId, createdBy]
    );

    await client.query(
      `
      UPDATE tapes
      SET availability_status = 'out_of_dry_box'
      WHERE tape_id = $1
      `,
      [tapeId]
    );

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
});

// UPDATE
router.put('/electrode-cut-batches/:id', auth, async (req, res) => {
  const cutBatchId = Number(req.params.id);

  const {
    target_form_factor,
    target_config_code,
    target_config_other,
    shape,
    diameter_mm,
    length_mm,
    width_mm,
    comments
  } = req.body;

  if (!Number.isInteger(cutBatchId) || cutBatchId <= 0) {
    return res.status(400).json({ error: 'Некорректный ID партии' });
  }

  try {
    const currentRes = await pool.query(
      `
      SELECT
        target_form_factor,
        target_config_code,
        target_config_other,
        shape,
        diameter_mm,
        length_mm,
        width_mm,
        comments
      FROM electrode_cut_batches
      WHERE cut_batch_id = $1
      `,
      [cutBatchId]
    );

    if (currentRes.rowCount === 0) {
      return res.status(404).json({ error: 'Партия не найдена' });
    }

    const current = currentRes.rows[0];
    const geometry = normalizeCutBatchGeometry({
      target_form_factor: target_form_factor !== undefined ? target_form_factor : current.target_form_factor,
      target_config_code: target_config_code !== undefined ? target_config_code : current.target_config_code,
      target_config_other: target_config_other !== undefined ? target_config_other : current.target_config_other,
      shape: shape !== undefined ? shape : current.shape,
      diameter_mm: diameter_mm !== undefined ? diameter_mm : current.diameter_mm,
      length_mm: length_mm !== undefined ? length_mm : current.length_mm,
      width_mm: width_mm !== undefined ? width_mm : current.width_mm
    });

    if (geometry.error) {
      return res.status(400).json({ error: geometry.error });
    }

    const newVals = {
      target_form_factor: geometry.target_form_factor,
      target_config_code: geometry.target_config_code,
      target_config_other: geometry.target_config_other,
      shape: geometry.shape,
      diameter_mm: geometry.diameter_mm,
      length_mm: geometry.length_mm,
      width_mm: geometry.width_mm,
      comments: comments !== undefined ? (comments || null) : current.comments
    };

    const result = await pool.query(
      `
      UPDATE electrode_cut_batches
      SET
        target_form_factor = $1,
        target_config_code = $2,
        target_config_other = $3,
        shape = $4,
        diameter_mm = $5,
        length_mm = $6,
        width_mm = $7,
        comments = $8,
        updated_by = $9,
        updated_at = now()
      WHERE cut_batch_id = $10
      RETURNING *
      `,
      [
        newVals.target_form_factor,
        newVals.target_config_code,
        newVals.target_config_other,
        newVals.shape,
        newVals.diameter_mm,
        newVals.length_mm,
        newVals.width_mm,
        newVals.comments,
        req.user.userId,
        cutBatchId
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Партия не найдена' });
    }

    await trackChanges(pool, 'electrode_cut_batch', 'electrode_cut_batches', 'cut_batch_id', cutBatchId, current, newVals, req.user.userId);

    res.json(result.rows[0]);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET cut batch by ID
router.get('/electrode-cut-batches/:id', auth, async (req, res) => {
  const cutBatchId = Number(req.params.id);

  if (!Number.isInteger(cutBatchId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    const result = await pool.query(
      `
      SELECT b.*,
        u_created.name AS created_by_name,
        u_updated.name AS updated_by_name
      FROM electrode_cut_batches b
      LEFT JOIN users u_created ON u_created.user_id = b.created_by
      LEFT JOIN users u_updated ON u_updated.user_id = b.updated_by
      WHERE b.cut_batch_id = $1
      `,
      [cutBatchId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Партия не найдена' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE cut batch (and cascade delete electrodes and measurements)
router.delete('/electrode-cut-batches/:id', auth, async (req, res) => {
  const cutBatchId = Number(req.params.id);

  if (!Number.isInteger(cutBatchId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    await pool.query(
      `DELETE FROM electrode_cut_batches WHERE cut_batch_id = $1`,
      [cutBatchId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});



// GET electrodes by batch
router.get('/electrode-cut-batches/:id/electrodes', auth, async (req, res) => {
  const cutBatchId = Number(req.params.id);

  if (!Number.isInteger(cutBatchId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    const result = await pool.query(
      `
      SELECT *
      FROM electrodes
      WHERE cut_batch_id = $1
      ORDER BY
        status_code ASC,
        electrode_mass_g DESC,
        electrode_id ASC
      `,
      [cutBatchId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});



// -------- FOIL MASS MEASUREMENTS --------

// ADD measurement
router.post('/electrode-cut-batches/:id/foil-masses', auth, async (req, res) => {
  const cutBatchId = Number(req.params.id);
  const { mass_g } = req.body;
  const mass = Number(mass_g);

  if (!Number.isInteger(cutBatchId) || !Number.isFinite(mass) || mass <= 0) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO foil_mass_measurements (cut_batch_id, mass_g)
      VALUES ($1, $2)
      RETURNING *
      `,
      [cutBatchId, mass]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET measurements
router.get('/electrode-cut-batches/:id/foil-masses', auth, async (req, res) => {
  const cutBatchId = Number(req.params.id);

  if (!Number.isInteger(cutBatchId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    const result = await pool.query(
      `
      SELECT *
      FROM foil_mass_measurements
      WHERE cut_batch_id = $1
      ORDER BY foil_measurement_id
      `,
      [cutBatchId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE all measurements for a batch
router.delete('/electrode-cut-batches/:id/foil-masses', auth, async (req, res) => {
  const cutBatchId = Number(req.params.id);

  if (!Number.isInteger(cutBatchId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    await pool.query(
      `
      DELETE FROM foil_mass_measurements
      WHERE cut_batch_id = $1
      `,
      [cutBatchId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


// These don't seem to appear anywhere... 
// THere are no foil-measurements routes in the html files... 
// UPDATE measurement
router.put('/foil-measurements/:id', auth, async (req, res) => {
  const measurementId = Number(req.params.id);
  const { mass_g } = req.body;

  if (!Number.isInteger(measurementId) || !mass_g || Number(mass_g) <= 0) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
    const current = await pool.query('SELECT mass_g FROM foil_mass_measurements WHERE foil_measurement_id = $1', [measurementId]);
    if (current.rowCount === 0) {
      return res.status(404).json({ error: 'Измерение не найдено' });
    }

    const result = await pool.query(
      `
      UPDATE foil_mass_measurements
      SET mass_g = $1
      WHERE foil_measurement_id = $2
      RETURNING *
      `,
      [mass_g, measurementId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Измерение не найдено' });
    }

    await trackChanges(pool, 'foil_measurement', 'foil_mass_measurements', 'foil_measurement_id', measurementId, current.rows[0], { mass_g }, req.user.userId, null, false);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE measurement
router.delete('/foil-measurements/:id', auth, async (req, res) => {
  const measurementId = Number(req.params.id);

  if (!Number.isInteger(measurementId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    await pool.query(
      `DELETE FROM foil_mass_measurements WHERE foil_measurement_id = $1`,
      [measurementId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});



// -------- ELECTRODES --------

// CREATE electrode
router.post('/', auth, async (req, res) => {
  const {
    cut_batch_id,
    electrode_mass_g,
    cup_number,
    comments
  } = req.body;

  const mass = Number(electrode_mass_g);
  
  if (
    !Number.isInteger(cut_batch_id) ||
    !Number.isFinite(mass) ||
    mass <= 0
  ) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO electrodes (
        cut_batch_id,
        number_in_batch,
        electrode_mass_g,
        cup_number,
        comments
      )
      VALUES (
        $1,
        (
          SELECT COALESCE(MAX(number_in_batch),0) + 1
          FROM electrodes
          WHERE cut_batch_id = $1
        ),
        $2,
        $3,
        $4
      )
      RETURNING *
      `,
      [
        cut_batch_id,
        mass,
        cup_number ?? null,
        comments || null
      ]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });

  }
});

// UPDATE electrode status
router.put('/:id/status', auth, async (req, res) => {
  const electrodeId = Number(req.params.id);
  const { status_code, used_in_battery_id, scrapped_reason } = req.body;

  if (!Number.isInteger(electrodeId) || !Number.isInteger(status_code)) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  if (![1,2,3].includes(status_code)) {
    return res.status(400).json({ error: 'Некорректный статус' });
  }

  if (status_code === 3 && !scrapped_reason) {
    return res.status(400).json({ error: 'Нужно указать причину списания' });
  }

  if (status_code === 2 && !used_in_battery_id) {
    return res.status(400).json({ error: 'Нужно указать батарею' });
  }
  
  try {
    const current = await pool.query('SELECT status_code, used_in_battery_id, scrapped_reason FROM electrodes WHERE electrode_id = $1', [electrodeId]);
    if (current.rowCount === 0) {
      return res.status(404).json({ error: 'Электрод не найден' });
    }

    const newVals = { status_code, used_in_battery_id: used_in_battery_id || null, scrapped_reason: scrapped_reason || null };

    const result = await pool.query(
      `
      UPDATE electrodes
      SET status_code = $1,
          used_in_battery_id = $2,
          scrapped_reason = $3
      WHERE electrode_id = $4
      RETURNING *
      `,
      [newVals.status_code, newVals.used_in_battery_id, newVals.scrapped_reason, electrodeId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Электрод не найден' });
    }

    await trackChanges(pool, 'electrode', 'electrodes', 'electrode_id', electrodeId, current.rows[0], newVals, req.user.userId, null, false);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// UPDATE electrode fields (mass, cup, comments)
router.put('/:id', auth, async (req, res) => {

  const electrodeId = Number(req.params.id);
  const {
    electrode_mass_g,
    cup_number,
    comments
  } = req.body;

  if (!Number.isInteger(electrodeId)) {
    return res.status(400).json({ error: 'Invalid electrode id' });
  }

  try {
    const current = await pool.query('SELECT electrode_mass_g, cup_number, comments FROM electrodes WHERE electrode_id = $1', [electrodeId]);
    if (current.rowCount === 0) {
      return res.status(404).json({ error: 'Electrode not found' });
    }

    const result = await pool.query(
      `
      UPDATE electrodes
      SET
        electrode_mass_g = COALESCE($1, electrode_mass_g),
        cup_number = COALESCE($2, cup_number),
        comments = COALESCE($3, comments)
      WHERE electrode_id = $4
      RETURNING *
      `,
      [
        electrode_mass_g ?? null,
        cup_number ?? null,
        comments ?? null,
        electrodeId
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Electrode not found' });
    }

    const newVals = {};
    if (electrode_mass_g !== undefined) newVals.electrode_mass_g = electrode_mass_g;
    if (cup_number !== undefined) newVals.cup_number = cup_number;
    if (comments !== undefined) newVals.comments = comments;
    await trackChanges(pool, 'electrode', 'electrodes', 'electrode_id', electrodeId, current.rows[0], newVals, req.user.userId, null, false);

    res.json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Server error' });

  }

});

// DELETE single electrode
router.delete('/:id', auth, async (req, res) => {

  const electrodeId = Number(req.params.id);

  if (!Number.isInteger(electrodeId)) {
    return res.status(400).json({ error: 'Invalid electrode id' });
  }

  try {

    const check = await pool.query(
      `
      SELECT used_in_battery_id
      FROM electrodes
      WHERE electrode_id = $1
      `,
      [electrodeId]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Electrode not found' });
    }

    if (check.rows[0].used_in_battery_id) {
      return res.status(400).json({
        error: 'Electrode already used in a battery and cannot be deleted'
      });
    }

    await pool.query(
      `
      DELETE FROM electrodes
      WHERE electrode_id = $1
      `,
      [electrodeId]
    );

    res.json({ success: true });

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Server error' });

  }

});


// -------- ELECTRODE DRYING --------

// CREATE or UPDATE drying record (UPSERT)
router.post('/electrode-cut-batches/:id/drying', auth, async (req, res) => {

  const cutBatchId = Number(req.params.id);

  const {
    start_time,
    end_time,
    temperature_c,
    other_parameters,
    comments
  } = req.body;

  if (!Number.isInteger(cutBatchId)) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {

    const result = await pool.query(
      `
      INSERT INTO electrode_drying (
        cut_batch_id,
        start_time,
        end_time,
        temperature_c,
        other_parameters,
        comments
      )
      VALUES ($1,$2,$3,$4,$5,$6)

      ON CONFLICT (cut_batch_id)
      DO UPDATE SET
        start_time       = EXCLUDED.start_time,
        end_time         = EXCLUDED.end_time,
        temperature_c    = EXCLUDED.temperature_c,
        other_parameters = EXCLUDED.other_parameters,
        comments         = EXCLUDED.comments

      RETURNING *
      `,
      [
        cutBatchId,
        start_time || null,
        end_time || null,
        temperature_c ?? null,
        other_parameters || null,
        comments || null
      ]
    );

    res.json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });

  }

});

// GET drying records by batch
router.get('/electrode-cut-batches/:id/drying', auth, async (req, res) => {
  const cutBatchId = Number(req.params.id);

  if (!Number.isInteger(cutBatchId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    const result = await pool.query(
      `
      SELECT *
      FROM electrode_drying
      WHERE cut_batch_id = $1
      LIMIT 1
      `,
      [cutBatchId]
    );

    res.json(result.rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT update drying record
router.put('/electrode-drying/:id', auth, async (req, res) => {
  const dryingId = Number(req.params.id);
  const { start_time, end_time, temperature_c, other_parameters, comments } = req.body;

  if (!Number.isInteger(dryingId)) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
    const current = await pool.query('SELECT start_time, end_time, temperature_c, other_parameters, comments FROM electrode_drying WHERE drying_id = $1', [dryingId]);
    if (current.rowCount === 0) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }

    const newVals = { start_time: start_time || null, end_time: end_time || null, temperature_c: temperature_c ?? null, other_parameters: other_parameters || null, comments: comments || null };

    const result = await pool.query(
      `
      UPDATE electrode_drying
      SET start_time = $1,
          end_time = $2,
          temperature_c = $3,
          other_parameters = $4,
          comments = $5
      WHERE drying_id = $6
      RETURNING *
      `,
      [newVals.start_time, newVals.end_time, newVals.temperature_c, newVals.other_parameters, newVals.comments, dryingId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }

    await trackChanges(pool, 'electrode_drying', 'electrode_drying', 'drying_id', dryingId, current.rows[0], newVals, req.user.userId, null, false);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE drying record
router.delete('/electrode-drying/:id', auth, async (req, res) => {
  const dryingId = Number(req.params.id);

  if (!Number.isInteger(dryingId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    await pool.query(
      `DELETE FROM electrode_drying WHERE drying_id = $1`,
      [dryingId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});




module.exports = router;
