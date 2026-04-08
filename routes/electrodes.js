const express = require('express');
const router = express.Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');

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
        u.name AS created_by_name,
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
      LEFT JOIN users u
        ON u.user_id = b.created_by
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

  try {
    const result = await pool.query(
      `
      INSERT INTO electrode_cut_batches (
        tape_id,
        created_by,
        shape,
        diameter_mm,
        length_mm,
        width_mm,
        comments
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
      `,
      [
        tapeId,
        createdBy,
        shape || null,
        diameter_mm ?? null,
        length_mm ?? null,
        width_mm ?? null,
        comments || null
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// UPDATE
router.put('/electrode-cut-batches/:id', auth, async (req, res) => {
  const cutBatchId = Number(req.params.id);

  const {
    shape,
    diameter_mm,
    length_mm,
    width_mm,
    comments
  } = req.body;

  if (!Number.isInteger(cutBatchId) || cutBatchId <= 0) {
    return res.status(400).json({ error: 'Некорректный ID партии' });
  }

  if (shape && !['circle','rectangle'].includes(shape)) {
    return res.status(400).json({ error: 'Некорректная форма электрода' });
  }

  try {
    const result = await pool.query(
      `
      UPDATE electrode_cut_batches
      SET
        shape = $1,
        diameter_mm = $2,
        length_mm = $3,
        width_mm = $4,
        comments = $5
      WHERE cut_batch_id = $6
      RETURNING *
      `,
      [
        shape || null,
        diameter_mm ?? null,
        length_mm ?? null,
        width_mm ?? null,
        comments || null,
        cutBatchId
      ]
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

// GET cut batch by ID
router.get('/electrode-cut-batches/:id', auth, async (req, res) => {
  const cutBatchId = Number(req.params.id);

  if (!Number.isInteger(cutBatchId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    const result = await pool.query(
      `
      SELECT *
      FROM electrode_cut_batches
      WHERE cut_batch_id = $1
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
    const result = await pool.query(
      `
      UPDATE electrodes
      SET status_code = $1,
          used_in_battery_id = $2,
          scrapped_reason = $3
      WHERE electrode_id = $4
      RETURNING *
      `,
      [
        status_code,
        used_in_battery_id || null,
        scrapped_reason || null,
        electrodeId
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Электрод не найден' });
    }

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
      [
        start_time || null,
        end_time || null,
        temperature_c ?? null,
        other_parameters || null,
        comments || null,
        dryingId
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }

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
