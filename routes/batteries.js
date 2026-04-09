const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const router = express.Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');
const { trackChanges } = require('../middleware/trackChanges');

const ALLOWED_COIN_LAYOUTS = new Set(['SE', 'ES', 'ESE']);

async function ensureBatteryAssembledStatus(batteryId) {
  await pool.query(
    `
    WITH readiness AS (
      SELECT
        (
          EXISTS (SELECT 1 FROM battery_coin_config c WHERE c.battery_id = $1)
          OR EXISTS (SELECT 1 FROM battery_pouch_config p WHERE p.battery_id = $1)
          OR EXISTS (SELECT 1 FROM battery_cyl_config cy WHERE cy.battery_id = $1)
        ) AS has_config,
        EXISTS (
          SELECT 1 FROM battery_electrode_sources es WHERE es.battery_id = $1
        ) AS has_sources,
        EXISTS (
          SELECT 1 FROM battery_electrodes el WHERE el.battery_id = $1
        ) AS has_electrodes,
        EXISTS (
          SELECT 1 FROM battery_sep_config s WHERE s.battery_id = $1
        ) AS has_separator,
        EXISTS (
          SELECT 1 FROM battery_electrolyte e WHERE e.battery_id = $1
        ) AS has_electrolyte
    )
    UPDATE batteries b
    SET status = 'assembled'
    FROM readiness r
    WHERE b.battery_id = $1
      AND b.status IS NULL
      AND r.has_config
      AND r.has_sources
      AND r.has_electrodes
      AND r.has_separator
      AND r.has_electrolyte
    `,
    [batteryId]
  );
}

router.get('/test', async (req, res) => {
  const result = await pool.query('SELECT 1 as ok');
  res.json(result.rows);
});



// ---------- BATTERIES ----------

// Create a new battery header
router.post('/', auth, async (req, res) => {

  const {
    project_id,
    form_factor,
    created_by,
    battery_notes
  } = req.body;

  const projectId = Number(project_id);
  const createdBy = Number(created_by);

  if (
    !Number.isInteger(projectId) ||
    !Number.isInteger(createdBy) ||
    !form_factor
  ) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {

    const result = await pool.query(
      `
      INSERT INTO batteries (
        project_id,
        form_factor,
        created_by,
        battery_notes
      )
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [
        projectId,
        form_factor,
        createdBy,
        battery_notes || null
      ]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка создания аккумулятора' });

  }

});

// List batteries
router.get('/', auth, async (req, res) => {
  try {

    const result = await pool.query(
      `
      SELECT
        b.battery_id,
        b.project_id,
        p.name AS project_name,
        b.form_factor,
        b.status,
        b.created_by,
        u_created.name AS created_by_name,
        b.battery_notes AS notes,
        b.created_at,
        b.updated_by,
        b.updated_at,
        u_updated.name AS updated_by_name
      FROM batteries b
      LEFT JOIN projects p
        ON p.project_id = b.project_id
      LEFT JOIN users u_created
        ON u_created.user_id = b.created_by
      LEFT JOIN users u_updated
        ON u_updated.user_id = b.updated_by
      ORDER BY b.battery_id DESC
      `
    );

    res.json(result.rows);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки аккумуляторов' });

  }
});

// Read battery header
router.get('/:id', auth, async (req, res) => {

  const batteryId = Number(req.params.id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный ID батареи' });
  }

  try {

    const result = await pool.query(
      `
      SELECT
        b.battery_id,
        b.project_id,
        p.name AS project_name,
        b.form_factor,
        b.created_by,
        u.name AS created_by_name,
        b.battery_notes AS notes,
        b.created_at
      FROM batteries b
      LEFT JOIN projects p
        ON p.project_id = b.project_id
      LEFT JOIN users u
        ON u.user_id = b.created_by
      WHERE b.battery_id = $1
      `,
      [batteryId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Батарея не найдена' });
    }

    res.json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки батареи' });

  }

});

// Update battery header
router.patch('/:id', auth, async (req, res) => {

  const batteryId = Number(req.params.id);

  const {
    project_id,
    form_factor,
    created_by,
    battery_notes,
    status
  } = req.body;

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный ID батареи' });
  }

  try {

    if (status === 'assembled') {

      const check = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE role = 'anode') AS anodes,
          COUNT(*) FILTER (WHERE role = 'cathode') AS cathodes
        FROM battery_electrodes
        WHERE battery_id = $1
      `, [batteryId]);

      const { anodes, cathodes } = check.rows[0];

      const modeRes = await pool.query(`
        SELECT coin_cell_mode
        FROM battery_coin_config
        WHERE battery_id = $1
      `, [batteryId]);

      const mode = modeRes.rows[0]?.coin_cell_mode;

      if (mode === 'full_cell' && (anodes !== 1 || cathodes !== 1)) {
        return res.status(400).json({
          error: 'Full cell must have exactly 1 anode and 1 cathode'
        });
      }

      if (mode === 'half_cell' && (anodes + cathodes) !== 1) {
        return res.status(400).json({
          error: 'Half cell must have exactly 1 electrode'
        });
      }
    }

    const currentRes = await pool.query(
      `
      SELECT
        project_id,
        form_factor,
        created_by,
        battery_notes,
        status
      FROM batteries
      WHERE battery_id = $1
      `,
      [batteryId]
    );

    if (currentRes.rows.length === 0) {
      return res.status(404).json({ error: 'Батарея не найдена' });
    }

    const current = currentRes.rows[0];

    const newVals = {
      project_id: project_id !== undefined ? Number(project_id) : current.project_id,
      form_factor: form_factor !== undefined ? form_factor : current.form_factor,
      created_by: created_by !== undefined ? Number(created_by) : current.created_by,
      battery_notes: battery_notes !== undefined ? battery_notes : current.battery_notes,
      status: status !== undefined ? status : current.status,
    };

    const result = await pool.query(
      `
      UPDATE batteries
      SET
        project_id = $1,
        form_factor = $2,
        created_by = $3,
        battery_notes = $4,
        status = $5,
        updated_by = $6,
        updated_at = now()
      WHERE battery_id = $7
      RETURNING
        battery_id,
        project_id,
        form_factor,
        created_by,
        battery_notes AS notes,
        status,
        created_at,
        updated_by,
        updated_at
      `,
      [newVals.project_id, newVals.form_factor, newVals.created_by, newVals.battery_notes, newVals.status, req.user.userId, batteryId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Батарея не найдена' });
    }

    await trackChanges(pool, 'battery', 'batteries', 'battery_id', batteryId, current, newVals, req.user.userId);

    res.json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления батареи' });

  }

});



// Save coin-cell configuration
router.post('/battery_coin_config', auth, async (req, res) => {

  const {
    battery_id,
    coin_cell_mode,
    coin_size_code,
    half_cell_type,
    li_foil_notes,
    spacer_thickness_mm,
    spacer_count,
    spacer_notes,
    coin_layout
  } = req.body;

  if (coin_layout != null && coin_layout !== '' && !ALLOWED_COIN_LAYOUTS.has(coin_layout)) {
    return res.status(400).json({ error: 'Допустимые схемы для coin cell: SE, ES, ESE' });
  }

  try {

    const result = await pool.query(
      `
      INSERT INTO battery_coin_config (
        battery_id,
        coin_cell_mode,
        coin_size_code,
        half_cell_type,
        li_foil_notes,
        spacer_thickness_mm,
        spacer_count,
        spacer_notes,
        coin_layout
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (battery_id) DO UPDATE SET
        coin_cell_mode = EXCLUDED.coin_cell_mode,
        coin_size_code = EXCLUDED.coin_size_code,
        half_cell_type = EXCLUDED.half_cell_type,
        li_foil_notes = EXCLUDED.li_foil_notes,
        spacer_thickness_mm = EXCLUDED.spacer_thickness_mm,
        spacer_count = EXCLUDED.spacer_count,
        spacer_notes = EXCLUDED.spacer_notes,
        coin_layout = EXCLUDED.coin_layout
      RETURNING *
      `,
      [
        battery_id,
        coin_cell_mode || null,
        coin_size_code || null,
        half_cell_type || null,
        li_foil_notes || null,
        spacer_thickness_mm != null ? Number(spacer_thickness_mm) : null,
        spacer_count != null ? Number(spacer_count) : null,
        spacer_notes || null,
        coin_layout || null
      ]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка создания конфигурации монеточного элемента' });

  }

});

// Read coin-cell configuration
router.get('/battery_coin_config/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {

    const result = await pool.query(
      `
      SELECT
        battery_id,
        coin_cell_mode,
        coin_size_code,
        half_cell_type,
        li_foil_notes,
        spacer_thickness_mm,
        spacer_count,
        spacer_notes,
        coin_layout
      FROM battery_coin_config
      WHERE battery_id = $1
      `,
      [batteryId]
    );

    if (result.rows.length === 0) {
      return res.json(null);
    }

    res.json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки конфигурации монеточного элемента' });

  }

});

// Update coin-cell configuration
router.patch('/battery_coin_config/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);
  const hasCoinCellMode = Object.prototype.hasOwnProperty.call(req.body, 'coin_cell_mode');
  const hasCoinSizeCode = Object.prototype.hasOwnProperty.call(req.body, 'coin_size_code');
  const hasHalfCellType = Object.prototype.hasOwnProperty.call(req.body, 'half_cell_type');
  const hasLiFoilNotes = Object.prototype.hasOwnProperty.call(req.body, 'li_foil_notes');
  const hasSpacerThickness = Object.prototype.hasOwnProperty.call(req.body, 'spacer_thickness_mm');
  const hasSpacerCount = Object.prototype.hasOwnProperty.call(req.body, 'spacer_count');
  const hasSpacerNotes = Object.prototype.hasOwnProperty.call(req.body, 'spacer_notes');
  const hasCoinLayout = Object.prototype.hasOwnProperty.call(req.body, 'coin_layout');

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  if (hasCoinLayout) {
    const layout = req.body.coin_layout;
    if (layout != null && layout !== '' && !ALLOWED_COIN_LAYOUTS.has(layout)) {
      return res.status(400).json({ error: 'Допустимые схемы для coin cell: SE, ES, ESE' });
    }
  }

  try {
    const current = await pool.query(
      'SELECT coin_cell_mode, coin_size_code, half_cell_type, li_foil_notes, spacer_thickness_mm, spacer_count, spacer_notes, coin_layout FROM battery_coin_config WHERE battery_id = $1',
      [batteryId]
    );

    const result = await pool.query(
      `
      UPDATE battery_coin_config
      SET
        coin_cell_mode = CASE WHEN $1 THEN $2 ELSE coin_cell_mode END,
        coin_size_code = CASE WHEN $3 THEN $4 ELSE coin_size_code END,
        half_cell_type = CASE WHEN $5 THEN $6 ELSE half_cell_type END,
        li_foil_notes = CASE WHEN $7 THEN $8 ELSE li_foil_notes END,
        spacer_thickness_mm = CASE WHEN $9 THEN $10 ELSE spacer_thickness_mm END,
        spacer_count = CASE WHEN $11 THEN $12 ELSE spacer_count END,
        spacer_notes = CASE WHEN $13 THEN $14 ELSE spacer_notes END,
        coin_layout = CASE WHEN $15 THEN $16 ELSE coin_layout END
      WHERE battery_id = $17
      RETURNING
        battery_id,
        coin_cell_mode,
        coin_size_code,
        half_cell_type,
        li_foil_notes,
        spacer_thickness_mm,
        spacer_count,
        spacer_notes,
        coin_layout
      `,
      [
        hasCoinCellMode,
        hasCoinCellMode ? (req.body.coin_cell_mode || null) : null,
        hasCoinSizeCode,
        hasCoinSizeCode ? (req.body.coin_size_code || null) : null,
        hasHalfCellType,
        hasHalfCellType ? (req.body.half_cell_type || null) : null,
        hasLiFoilNotes,
        hasLiFoilNotes ? (req.body.li_foil_notes || null) : null,
        hasSpacerThickness,
        hasSpacerThickness ? (
          req.body.spacer_thickness_mm != null ? Number(req.body.spacer_thickness_mm) : null
        ) : null,
        hasSpacerCount,
        hasSpacerCount ? (
          req.body.spacer_count != null ? Number(req.body.spacer_count) : null
        ) : null,
        hasSpacerNotes,
        hasSpacerNotes ? (req.body.spacer_notes || null) : null,
        hasCoinLayout,
        hasCoinLayout ? (req.body.coin_layout || null) : null,
        batteryId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Конфигурация не найдена' });
    }

    if (current.rowCount > 0) {
      const newVals = {};
      if (hasCoinCellMode) newVals.coin_cell_mode = req.body.coin_cell_mode || null;
      if (hasCoinSizeCode) newVals.coin_size_code = req.body.coin_size_code || null;
      if (hasHalfCellType) newVals.half_cell_type = req.body.half_cell_type || null;
      if (hasLiFoilNotes) newVals.li_foil_notes = req.body.li_foil_notes || null;
      if (hasSpacerThickness) newVals.spacer_thickness_mm = req.body.spacer_thickness_mm != null ? Number(req.body.spacer_thickness_mm) : null;
      if (hasSpacerCount) newVals.spacer_count = req.body.spacer_count != null ? Number(req.body.spacer_count) : null;
      if (hasSpacerNotes) newVals.spacer_notes = req.body.spacer_notes || null;
      if (hasCoinLayout) newVals.coin_layout = req.body.coin_layout || null;
      await trackChanges(pool, 'battery_coin_config', 'battery_coin_config', 'battery_id', batteryId, current.rows[0], newVals, req.user.userId, null, false);
    }

    res.json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления конфигурации монеточного элемента' });

  }

});


// Save pouch-cell configuration
router.post('/battery_pouch_config', auth, async (req, res) => {

  const {
    battery_id,
    pouch_notes
  } = req.body;

  const batteryId = Number(battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {

    const result = await pool.query(
      `
      INSERT INTO battery_pouch_config (
        battery_id,
        pouch_notes
      )
      VALUES ($1, $2)
      ON CONFLICT (battery_id)
      DO UPDATE SET
        pouch_notes = EXCLUDED.pouch_notes
      RETURNING *
      `,
      [
        batteryId,
        pouch_notes || null
      ]
    );

    res.status(200).json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения конфигурации пакетного элемента' });

  }

});

// Read pouch-cell configuration
router.get('/battery_pouch_config/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {

    const result = await pool.query(
      `
      SELECT
        battery_id,
        pouch_notes
      FROM battery_pouch_config
      WHERE battery_id = $1
      `,
      [batteryId]
    );

    if (result.rows.length === 0) {
      return res.json(null);
    }

    res.json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки конфигурации пакетного элемента' });

  }

});

// Update pouch-cell configuration
router.patch('/battery_pouch_config/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  const {
    pouch_notes
  } = req.body;

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {
    const current = await pool.query('SELECT pouch_notes FROM battery_pouch_config WHERE battery_id = $1', [batteryId]);

    const result = await pool.query(
      `
      UPDATE battery_pouch_config
      SET
        pouch_notes = $1
      WHERE battery_id = $2
      RETURNING
        battery_id,
        pouch_notes
      `,
      [
        pouch_notes || null,
        batteryId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Конфигурация не найдена' });
    }

    if (current.rowCount > 0) {
      await trackChanges(pool, 'battery_pouch_config', 'battery_pouch_config', 'battery_id', batteryId, current.rows[0], { pouch_notes: pouch_notes || null }, req.user.userId, null, false);
    }

    res.json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления конфигурации пакетного элемента' });

  }

});



// Save cylindrical-cell configuration
router.post('/battery_cyl_config', auth, async (req, res) => {

  const {
    battery_id,
    cyl_size_code,
    cyl_notes
  } = req.body;

  const batteryId = Number(battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {

    const result = await pool.query(
      `
      INSERT INTO battery_cyl_config (
        battery_id,
        cyl_size_code,
        cyl_notes
      )
      VALUES ($1, $2, $3)
      ON CONFLICT (battery_id)
      DO UPDATE SET
        cyl_size_code = EXCLUDED.cyl_size_code,
        cyl_notes = EXCLUDED.cyl_notes
      RETURNING *
      `,
      [
        batteryId,
        cyl_size_code || null,
        cyl_notes || null
      ]
    );

    res.status(200).json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения конфигурации цилиндрического элемента' });

  }

});

// Read cylindrical-cell configuration
router.get('/battery_cyl_config/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {

    const result = await pool.query(
      `
      SELECT
        battery_id,
        cyl_size_code,
        cyl_notes
      FROM battery_cyl_config
      WHERE battery_id = $1
      `,
      [batteryId]
    );

    if (result.rows.length === 0) {
      return res.json(null);
    }

    res.json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки конфигурации цилиндрического элемента' });

  }

});

// Update cylindrical-cell configuration
router.patch('/battery_cyl_config/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  const {
    cyl_size_code,
    cyl_notes
  } = req.body;

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {
    const current = await pool.query('SELECT cyl_size_code, cyl_notes FROM battery_cyl_config WHERE battery_id = $1', [batteryId]);

    const result = await pool.query(
      `
      UPDATE battery_cyl_config
      SET
        cyl_size_code = $1,
        cyl_notes = $2
      WHERE battery_id = $3
      RETURNING
        battery_id,
        cyl_size_code,
        cyl_notes
      `,
      [
        cyl_size_code || null,
        cyl_notes || null,
        batteryId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Конфигурация не найдена' });
    }

    if (current.rowCount > 0) {
      await trackChanges(pool, 'battery_cyl_config', 'battery_cyl_config', 'battery_id', batteryId, current.rows[0], { cyl_size_code: cyl_size_code || null, cyl_notes: cyl_notes || null }, req.user.userId, null, false);
    }

    res.json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления конфигурации цилиндрического элемента' });

  }

});



// Save electrode sources for a battery

router.post('/battery_electrode_sources', auth, async (req, res) => {
  
  const {
    battery_id,
    cathode_tape_id,
    cathode_cut_batch_id,
    cathode_source_notes,
    anode_tape_id,
    anode_cut_batch_id,
    anode_source_notes
  } = req.body;

  const batteryId = Number(battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {
    const batteryResult = await pool.query(
      `SELECT form_factor FROM batteries WHERE battery_id = $1`,
      [batteryId]
    );

    if (batteryResult.rows.length === 0) {
      return res.status(400).json({ error: 'Некорректный ID батареи' });
    }

    const form = batteryResult.rows[0].form_factor;

    let coinMode = null;

    if (form === 'coin') {
      const modeResult = await pool.query(
        `
        SELECT coin_cell_mode
        FROM battery_coin_config
        WHERE battery_id = $1
        `,
        [batteryId]
      );

      if (modeResult.rows.length === 0) {
        return res.status(400).json({ error: 'Конфигурация coin cell не найдена' });
      }

      coinMode = modeResult.rows[0].coin_cell_mode;
    }

    const hasCathode = !!cathode_tape_id && !!cathode_cut_batch_id;
    const hasAnode = !!anode_tape_id && !!anode_cut_batch_id;

    if (form === 'coin' && coinMode === 'half_cell') {
      if ((hasCathode ? 1 : 0) + (hasAnode ? 1 : 0) !== 1) {
        return res.status(400).json({
          error: 'Для монеточной полуячейки должен быть выбран ровно один источник электродов'
        });
      }
    } else {
      if (!hasCathode || !hasAnode) {
        return res.status(400).json({
          error: 'Для данного элемента должны быть выбраны и катодный, и анодный источники'
        });
      }
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      if (hasCathode) {
        await client.query(
          `
          INSERT INTO battery_electrode_sources
            (battery_id, role, tape_id, cut_batch_id, source_notes)
          VALUES
            ($1, 'cathode', $2, $3, $4)
          ON CONFLICT (battery_id, role)
          DO UPDATE SET
            tape_id = EXCLUDED.tape_id,
            cut_batch_id = EXCLUDED.cut_batch_id,
            source_notes = EXCLUDED.source_notes
          `,
          [
            batteryId,
            Number(cathode_tape_id),
            Number(cathode_cut_batch_id),
            cathode_source_notes || null
          ]
        );
      } else {
        await client.query(
          `
          DELETE FROM battery_electrode_sources
          WHERE battery_id = $1 AND role = 'cathode'
          `,
          [batteryId]
        );
      }

      if (hasAnode) {
        await client.query(
          `
          INSERT INTO battery_electrode_sources
            (battery_id, role, tape_id, cut_batch_id, source_notes)
          VALUES
            ($1, 'anode', $2, $3, $4)
          ON CONFLICT (battery_id, role)
          DO UPDATE SET
            tape_id = EXCLUDED.tape_id,
            cut_batch_id = EXCLUDED.cut_batch_id,
            source_notes = EXCLUDED.source_notes
          `,
          [
            batteryId,
            Number(anode_tape_id),
            Number(anode_cut_batch_id),
            anode_source_notes || null
          ]
        );
      } else {
        await client.query(
          `
          DELETE FROM battery_electrode_sources
          WHERE battery_id = $1 AND role = 'anode'
          `,
          [batteryId]
        );
      }

      const result = await client.query(
        `
        SELECT
          battery_id,
          role,
          tape_id,
          cut_batch_id,
          source_notes
        FROM battery_electrode_sources
        WHERE battery_id = $1
        ORDER BY role
        `,
        [batteryId]
      );

      await client.query('COMMIT');
      res.status(200).json(result.rows);

    } catch (err) {
      await client.query('ROLLBACK');
      console.error(err);
      res.status(500).json({ error: 'Ошибка сохранения источников электродов' });
    } finally {
      client.release();
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения источников электродов' });
  }
});

// Read electrode sources for a battery
router.get('/battery_electrode_sources/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {

    const result = await pool.query(
      `
      SELECT
        battery_id,
        role,
        tape_id,
        cut_batch_id,
        source_notes
      FROM battery_electrode_sources
      WHERE battery_id = $1
      ORDER BY role;
      `,
      [batteryId]
    );

    if (result.rows.length === 0) {
      return res.json(null);
    }

    res.json(result.rows);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки источников электродов' });

  }

});

// Update electrode sources for a battery
router.patch('/battery_electrode_sources/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  const {
    cathode_tape_id,
    cathode_cut_batch_id,
    cathode_source_notes,
    anode_tape_id,
    anode_cut_batch_id,
    anode_source_notes
  } = req.body;

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {
    // Snapshot current state
    const currentSources = await pool.query(
      'SELECT role, tape_id, cut_batch_id, source_notes FROM battery_electrode_sources WHERE battery_id = $1',
      [batteryId]
    );
    const oldCathode = currentSources.rows.find(r => r.role === 'cathode') || {};
    const oldAnode = currentSources.rows.find(r => r.role === 'anode') || {};

    await pool.query(
      `
      UPDATE battery_electrode_sources
      SET
        tape_id = $2,
        cut_batch_id = $3,
        source_notes = $4
      WHERE battery_id = $1
        AND role = 'cathode'
      `,
      [
        batteryId,
        cathode_tape_id || null,
        cathode_cut_batch_id || null,
        cathode_source_notes || null
      ]
      );

      await pool.query(
      `
      UPDATE battery_electrode_sources
      SET
        tape_id = $2,
        cut_batch_id = $3,
        source_notes = $4
      WHERE battery_id = $1
        AND role = 'anode'
      `,
      [
        batteryId,
        anode_tape_id || null,
        anode_cut_batch_id || null,
        anode_source_notes || null
      ]
      );

      const cathodeNew = { tape_id: cathode_tape_id || null, cut_batch_id: cathode_cut_batch_id || null, source_notes: cathode_source_notes || null };
      const anodeNew = { tape_id: anode_tape_id || null, cut_batch_id: anode_cut_batch_id || null, source_notes: anode_source_notes || null };

      if (oldCathode.role) await trackChanges(pool, 'battery_electrode_source_cathode', 'battery_electrode_sources', 'battery_id', batteryId, oldCathode, cathodeNew, req.user.userId, null, false);
      if (oldAnode.role) await trackChanges(pool, 'battery_electrode_source_anode', 'battery_electrode_sources', 'battery_id', batteryId, oldAnode, anodeNew, req.user.userId, null, false);

      res.json({ success: true });

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления источников электродов' });

  }

});


// Update electrode stack
router.put('/battery_electrodes/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);
  const stack = req.body;

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  if (!Array.isArray(stack)) {
    return res.status(400).json({ error: 'Стек должен быть массивом' });
  }

  const client = await pool.connect();

  try {

    await client.query('BEGIN');

    // remove existing stack
    await client.query(
      `DELETE FROM battery_electrodes WHERE battery_id = $1`,
      [batteryId]
    );

    for (const row of stack) {

      await client.query(
        `
        INSERT INTO battery_electrodes (
          battery_id,
          electrode_id,
          role,
          position_index
        )
        VALUES ($1,$2,$3,$4)
        `,
        [
          batteryId,
          row.electrode_id,
          row.role,
          row.position_index
        ]
      );

      const updateResult = await client.query(
        `
        UPDATE electrodes
        SET
          status_code = 2,
          used_in_battery_id = $1
        WHERE electrode_id = $2
        AND status_code = 1
        RETURNING electrode_id
        `,
        [
          batteryId,
          row.electrode_id
        ]
      );

      if (updateResult.rows.length === 0) {
        throw new Error(`Electrode ${row.electrode_id} is already used`);
      }

    }

    await client.query('COMMIT');

    res.json({ success: true });

  } catch (err) {

    await client.query('ROLLBACK');
    console.error(err);

    res.status(500).json({
      error: 'Ошибка сохранения стека электродов'
    });

  } finally {

    client.release();

  }

});

// Read electrode stack for a battery
router.get('/battery_electrodes/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {

    const result = await pool.query(
      `
      SELECT
        electrode_id,
        role,
        position_index
      FROM battery_electrodes
      WHERE battery_id = $1
      ORDER BY position_index
      `,
      [batteryId]
    );

    res.json(result.rows);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки стека электродов' });

  }

});



// Save separator configuration
router.post('/battery_sep_config', auth, async (req, res) => {

  const {
    battery_id,
    separator_id,
    separator_notes
  } = req.body;

  const batteryId = Number(battery_id);
  const separatorId = separator_id ? Number(separator_id) : null;

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {

    const result = await pool.query(
      `
      INSERT INTO battery_sep_config (
        battery_id,
        separator_id,
        separator_notes
      )
      VALUES ($1,$2,$3)
      ON CONFLICT (battery_id)
      DO UPDATE SET
        separator_id = EXCLUDED.separator_id,
        separator_notes = EXCLUDED.separator_notes
      RETURNING *
      `,
      [
        batteryId,
        separatorId,
        separator_notes || null
      ]
    );

    res.status(200).json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения конфигурации сепаратора' });

  }

});

// Read separator configuration
router.get('/battery_sep_config/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {

    const result = await pool.query(
      `
      SELECT
        battery_id,
        separator_id,
        separator_notes
      FROM battery_sep_config
      WHERE battery_id = $1
      `,
      [batteryId]
    );

    if (result.rows.length === 0) {
      return res.json(null);
    }

    res.json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки конфигурации сепаратора' });

  }

});

// Update separator configuration
router.patch('/battery_sep_config/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  const {
    separator_id,
    separator_notes
  } = req.body;

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {

    const result = await pool.query(
      `
      UPDATE battery_sep_config
      SET
        separator_id = $1,
        separator_notes = $2
      WHERE battery_id = $3
      RETURNING
        battery_id,
        separator_id,
        separator_notes
      `,
      [
        separator_id ? Number(separator_id) : null,
        separator_notes || null,
        batteryId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Конфигурация сепаратора не найдена' });
    }

    res.json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления конфигурации сепаратора' });

  }

});



// Save electrolyte configuration
router.post('/battery_electrolyte', auth, async (req, res) => {

  const {
    battery_id,
    electrolyte_id,
    electrolyte_notes,
    electrolyte_total_ul
  } = req.body;

  const batteryId = Number(battery_id);
  const electrolyteId = electrolyte_id ? Number(electrolyte_id) : null;

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {

    const result = await pool.query(
      `
      INSERT INTO battery_electrolyte (
        battery_id,
        electrolyte_id,
        electrolyte_notes,
        electrolyte_total_ul
      )
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (battery_id)
      DO UPDATE SET
        electrolyte_id = EXCLUDED.electrolyte_id,
        electrolyte_notes = EXCLUDED.electrolyte_notes,
        electrolyte_total_ul = EXCLUDED.electrolyte_total_ul
      RETURNING *
      `,
      [
        batteryId,
        electrolyteId,
        electrolyte_notes || null,
        electrolyte_total_ul ?? null
      ]
    );

    res.status(200).json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения электролита' });

  }

});

// Read electrolyte configuration
router.get('/battery_electrolyte/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {

    const result = await pool.query(
      `
      SELECT
        battery_id,
        electrolyte_id,
        electrolyte_notes,
        electrolyte_total_ul
      FROM battery_electrolyte
      WHERE battery_id = $1
      `,
      [batteryId]
    );

    if (result.rows.length === 0) {
      return res.json(null);
    }

    res.json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки конфигурации электролита' });

  }

});

// Update electrolyte configuration
router.patch('/battery_electrolyte/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  const {
    electrolyte_id,
    electrolyte_notes,
    electrolyte_total_ul
  } = req.body;

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {

    const result = await pool.query(
      `
      UPDATE battery_electrolyte
      SET
        electrolyte_id = $1,
        electrolyte_notes = $2,
        electrolyte_total_ul = $3
      WHERE battery_id = $4
      RETURNING
        battery_id,
        electrolyte_id,
        electrolyte_notes,
        electrolyte_total_ul
      `,
      [
        electrolyte_id ? Number(electrolyte_id) : null,
        electrolyte_notes || null,
        electrolyte_total_ul ?? null,
        batteryId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Конфигурация электролита не найдена' });
    }

    res.json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления конфигурации электролита' });

  }

});



// Save battery QC data
router.post('/battery_qc', auth, async (req, res) => {

  const {
    battery_id,
    ocv_v,
    esr_mohm,
    qc_notes
  } = req.body;

  const batteryId = Number(battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {

    const result = await pool.query(
      `
      INSERT INTO battery_qc (
        battery_id,
        ocv_v,
        esr_mohm,
        qc_notes
      )
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (battery_id)
      DO UPDATE SET
        ocv_v = EXCLUDED.ocv_v,
        esr_mohm = EXCLUDED.esr_mohm,
        qc_notes = EXCLUDED.qc_notes
      RETURNING *
      `,
      [
        batteryId,
        ocv_v ?? null,
        esr_mohm ?? null,
        qc_notes || null
      ]
    );

    res.status(200).json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения выходного контроля' });

  }

});

// Read battery QC data
router.get('/battery_qc/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {

    const result = await pool.query(
      `
      SELECT
        battery_id,
        ocv_v,
        esr_mohm,
        qc_notes
      FROM battery_qc
      WHERE battery_id = $1
      `,
      [batteryId]
    );

    if (result.rows.length === 0) {
      return res.json(null);
    }

    res.json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки данных выходного контроля' });

  }

});

// Update battery QC data
router.patch('/battery_qc/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  const {
    ocv_v,
    esr_mohm,
    qc_notes
  } = req.body;

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {

    const result = await pool.query(
      `
      UPDATE battery_qc
      SET
        ocv_v = $1,
        esr_mohm = $2,
        qc_notes = $3
      WHERE battery_id = $4
      RETURNING
        battery_id,
        ocv_v,
        esr_mohm,
        qc_notes
      `,
      [
        ocv_v ?? null,
        esr_mohm ?? null,
        qc_notes || null,
        batteryId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Данные выходного контроля не найдены' });
    }

    res.json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления данных выходного контроля' });

  }

});


// Save battery electrochem data
router.post('/battery_electrochem', auth, async (req, res) => {

  const {
    battery_id,
    entries
  } = req.body;

  const batteryId = Number(battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: 'Не переданы файлы электрохимических испытаний' });
  }

  try {

    const uploadDir = path.join(__dirname, '..', 'uploads', 'electrochem');
    await fs.mkdir(uploadDir, { recursive: true });

    for (const entry of entries) {
      const originalName = entry.file_name || 'electrochem_file';
      const safeName = String(originalName).replace(/[^a-zA-Z0-9._-]/g, '_');
      const storedName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;
      const relativePath = `/uploads/electrochem/${storedName}`;
      const absolutePath = path.join(uploadDir, storedName);

      if (!entry.file_content_base64) {
        throw new Error('Не передано содержимое файла');
      }

      const buffer = Buffer.from(entry.file_content_base64, 'base64');
      await fs.writeFile(absolutePath, buffer);

      await pool.query(
        `
        INSERT INTO battery_electrochem (
          battery_id,
          file_name,
          file_link,
          electrochem_notes
        )
        VALUES ($1,$2,$3,$4)
        `,
        [
          batteryId,
          originalName,
          relativePath,
          entry.electrochem_notes || null
        ]
      );
    }

    const result = await pool.query(
      `
      SELECT
        battery_electrochem_id,
        battery_id,
        file_name,
        file_link,
        electrochem_notes,
        uploaded_at
      FROM battery_electrochem
      WHERE battery_id = $1
      ORDER BY battery_electrochem_id
      `,
      [batteryId]
    );

    res.status(200).json(result.rows);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения электрохимических испытаний' });

  }

});

// Read battery electrochem data
router.get('/battery_electrochem/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {

    const result = await pool.query(
      `
      SELECT
        battery_electrochem_id,
        battery_id,
        file_name,
        file_link,
        electrochem_notes,
        uploaded_at
      FROM battery_electrochem
      WHERE battery_id = $1
      ORDER BY battery_electrochem_id
      `,
      [batteryId]
    );

    if (result.rows.length === 0) {
      return res.json(null);
    }

    res.json(result.rows);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки электрохимических испытаний' });

  }

});

// Update battery electrochem data
router.patch('/battery_electrochem/:battery_id', auth, async (req, res) => {
  res.status(405).json({ error: 'Используйте POST для добавления новых файлов электрохимических испытаний' });

});



// ---------- LOAD THE FULL BATTERY RECORD ----------

// Generates JSON
router.get('/:id/assembly', auth, async (req, res) => {

  const batteryId = Number(req.params.id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {

    await ensureBatteryAssembledStatus(batteryId);

    const result = await pool.query(
      `
      SELECT jsonb_build_object(

        'battery',
        (
          SELECT row_to_json(b)
          FROM batteries b
          WHERE b.battery_id = $1
        ),

        'coin_config',
        (
          SELECT row_to_json(c)
          FROM battery_coin_config c
          WHERE c.battery_id = $1
        ),

        'pouch_config',
        (
          SELECT row_to_json(p)
          FROM battery_pouch_config p
          WHERE p.battery_id = $1
        ),

        'cyl_config',
        (
          SELECT row_to_json(cy)
          FROM battery_cyl_config cy
          WHERE cy.battery_id = $1
        ),

        'separator',
        (
          SELECT row_to_json(s)
          FROM battery_sep_config s
          WHERE s.battery_id = $1
        ),

        'electrolyte',
        (
          SELECT row_to_json(e)
          FROM battery_electrolyte e
          WHERE e.battery_id = $1
        ),

        'qc',
        (
          SELECT row_to_json(q)
          FROM battery_qc q
          WHERE q.battery_id = $1
        ),

        'electrochem',
        (
          SELECT COALESCE(
            jsonb_agg(to_jsonb(ec) ORDER BY ec.battery_electrochem_id),
            '[]'::jsonb
          )
          FROM battery_electrochem ec
          WHERE ec.battery_id = $1
        ),

        'electrode_sources',
        (
          SELECT COALESCE(
            jsonb_agg(to_jsonb(es)),
            '[]'::jsonb
          )
          FROM battery_electrode_sources es
          WHERE es.battery_id = $1
        ),

        'electrodes',
        (
          SELECT COALESCE(
            jsonb_agg(to_jsonb(el) ORDER BY el.position_index),
            '[]'::jsonb
          )
          FROM battery_electrodes el
          WHERE el.battery_id = $1
        )

      ) AS assembly
      `,
      [batteryId]
    );

    const assembly = result.rows[0].assembly;

    if (!assembly.battery) {
      return res.status(404).json({ error: 'Батарея не найдена' });
    }

    res.json(assembly);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки сборки батареи' });

  }

});



module.exports = router;
