const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/test', async (req, res) => {
  const result = await pool.query('SELECT 1 as ok');
  res.json(result.rows);
});



// ---------- BATTERIES ----------

// Create a new battery header
router.post('/', async (req, res) => {

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
router.get('/', async (req, res) => {
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
router.get('/:id', async (req, res) => {

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
router.patch('/:id', async (req, res) => {

  const batteryId = Number(req.params.id);

  const {
    project_id,
    form_factor,
    created_by,
    battery_notes
  } = req.body;

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный ID батареи' });
  }

  try {

    const result = await pool.query(
      `
      UPDATE batteries
      SET
        project_id = $1,
        form_factor = $2,
        created_by = $3,
        battery_notes = $4
      WHERE battery_id = $5
      RETURNING
        battery_id,
        project_id,
        form_factor,
        created_by,
        battery_notes AS notes,
        created_at
      `,
      [
        project_id ? Number(project_id) : null,
        form_factor || null,
        created_by ? Number(created_by) : null,
        battery_notes || null,
        batteryId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Батарея не найдена' });
    }

    res.json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления батареи' });

  }

});



// Save coin-cell configuration
router.post('/battery_coin_config', async (req, res) => {

  const {
    battery_id,
    coin_cell_mode,
    coin_size_code,
    half_cell_type,
    li_foil_notes,
    spacer_thickness_mm,
    spacer_count,
    coin_layout,
    electrolyte_drop_count,
    electrolyte_drop_volume,
    coin_layout_notes
  } = req.body;

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
        coin_layout,
        electrolyte_drop_count,
        electrolyte_drop_volume,
        coin_layout_notes
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
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
        coin_layout || null,
        electrolyte_drop_count != null ? Number(electrolyte_drop_count) : null,
        electrolyte_drop_volume != null ? Number(electrolyte_drop_volume) : null,
        coin_layout_notes || null
      ]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка создания конфигурации монеточного элемента' });

  }

});

// Read coin-cell configuration
router.get('/battery_coin_config/:battery_id', async (req, res) => {

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
        li_foil_notes
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
router.patch('/battery_coin_config/:battery_id', async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  const {
    coin_cell_mode,
    coin_size_code,
    half_cell_type,
    li_foil_notes,
    spacer_thickness_mm,
    spacer_count,
    coin_layout,
    electrolyte_drop_count,
    electrolyte_drop_volume,
    coin_layout_notes
  } = req.body;

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {

    const result = await pool.query(
      `
      UPDATE battery_coin_config
      SET
        coin_cell_mode = $1,
        coin_size_code = $2,
        half_cell_type = $3,
        li_foil_notes = $4,
        spacer_thickness_mm = $5,
        spacer_count = $6,
        coin_layout = $7,
        electrolyte_drop_count = $8,
        electrolyte_drop_volume =$9,
        coin_layout_notes = $10
      WHERE battery_id = $11
      RETURNING
        battery_id,
        coin_cell_mode,
        coin_size_code,
        half_cell_type,
        li_foil_notes,
        spacer_thickness_mm,
        spacer_count,
        coin_layout,
        electrolyte_drop_count,
        electrolyte_drop_volume,
        coin_layout_notes
      `,
      [
        coin_cell_mode || null,
        coin_size_code || null,
        half_cell_type || null,
        li_foil_notes || null,
        spacer_thickness_mm != null ? Number(spacer_thickness_mm) : null,
        spacer_count != null ? Number(spacer_count) : null,
        coin_layout || null,
        electrolyte_drop_count != null ? Number(electrolyte_drop_count) : null,
        electrolyte_drop_volume != null ? Number(electrolyte_drop_volume) : null,
        coin_layout_notes || null,
        batteryId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Конфигурация не найдена' });
    }

    res.json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления конфигурации монеточного элемента' });

  }

});


// Save pouch-cell configuration
router.post('/battery_pouch_config', async (req, res) => {

  const {
    battery_id,
    pouch_format_code,
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
        pouch_format_code,
        pouch_notes
      )
      VALUES ($1, $2, $3)
      ON CONFLICT (battery_id)
      DO UPDATE SET
        pouch_format_code = EXCLUDED.pouch_format_code,
        pouch_notes = EXCLUDED.pouch_notes
      RETURNING *
      `,
      [
        batteryId,
        pouch_format_code || null,
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
router.get('/battery_pouch_config/:battery_id', async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {

    const result = await pool.query(
      `
      SELECT
        battery_id,
        pouch_format_code,
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
router.patch('/battery_pouch_config/:battery_id', async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  const {
    pouch_format_code,
    pouch_notes
  } = req.body;

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {

    const result = await pool.query(
      `
      UPDATE battery_pouch_config
      SET
        pouch_format_code = $1,
        pouch_notes = $2
      WHERE battery_id = $3
      RETURNING
        battery_id,
        pouch_format_code,
        pouch_notes
      `,
      [
        pouch_format_code || null,
        pouch_notes || null,
        batteryId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Конфигурация не найдена' });
    }

    res.json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления конфигурации пакетного элемента' });

  }

});



// Save cylindrical-cell configuration
router.post('/battery_cyl_config', async (req, res) => {

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
router.get('/battery_cyl_config/:battery_id', async (req, res) => {

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
router.patch('/battery_cyl_config/:battery_id', async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  const {
    cyl_size_code,
    cyl_notes
  } = req.body;

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {

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

    res.json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления конфигурации цилиндрического элемента' });

  }

});



// Save electrode sources for a battery
router.post('/battery_electrode_sources', async (req, res) => {

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

    const result = await pool.query(
      `
      INSERT INTO battery_electrode_sources (
        battery_id,
        cathode_tape_id,
        cathode_cut_batch_id,
        cathode_source_notes,
        anode_tape_id,
        anode_cut_batch_id,
        anode_source_notes
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (battery_id)
      DO UPDATE SET
        cathode_tape_id = EXCLUDED.cathode_tape_id,
        cathode_cut_batch_id = EXCLUDED.cathode_cut_batch_id,
        cathode_source_notes = EXCLUDED.cathode_source_notes,
        anode_tape_id = EXCLUDED.anode_tape_id,
        anode_cut_batch_id = EXCLUDED.anode_cut_batch_id,
        anode_source_notes = EXCLUDED.anode_source_notes
      RETURNING *
      `,
      [
        batteryId,
        cathode_tape_id || null,
        cathode_cut_batch_id || null,
        cathode_source_notes || null,
        anode_tape_id || null,
        anode_cut_batch_id || null,
        anode_source_notes || null
      ]
    );

    res.status(200).json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения источников электродов' });

  }

});

// Read electrode sources for a battery
router.get('/battery_electrode_sources/:battery_id', async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {

    const result = await pool.query(
      `
      SELECT
        battery_id,
        cathode_tape_id,
        cathode_cut_batch_id,
        cathode_source_notes,
        anode_tape_id,
        anode_cut_batch_id,
        anode_source_notes
      FROM battery_electrode_sources
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
    res.status(500).json({ error: 'Ошибка загрузки источников электродов' });

  }

});

// Update electrode sources for a battery
router.patch('/battery_electrode_sources/:battery_id', async (req, res) => {

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

    const result = await pool.query(
      `
      UPDATE battery_electrode_sources
      SET
        cathode_tape_id = $1,
        cathode_cut_batch_id = $2,
        cathode_source_notes = $3,
        anode_tape_id = $4,
        anode_cut_batch_id = $5,
        anode_source_notes = $6
      WHERE battery_id = $7
      RETURNING
        battery_id,
        cathode_tape_id,
        cathode_cut_batch_id,
        cathode_source_notes,
        anode_tape_id,
        anode_cut_batch_id,
        anode_source_notes
      `,
      [
        cathode_tape_id || null,
        cathode_cut_batch_id || null,
        cathode_source_notes || null,
        anode_tape_id || null,
        anode_cut_batch_id || null,
        anode_source_notes || null,
        batteryId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Источники электродов не найдены' });
    }

    res.json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления источников электродов' });

  }

});


// Update electrode stack
router.put('/battery_electrodes/:battery_id', async (req, res) => {

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
router.get('/battery_electrodes/:battery_id', async (req, res) => {

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
router.post('/battery_sep_config', async (req, res) => {

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
router.get('/battery_sep_config/:battery_id', async (req, res) => {

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
router.patch('/battery_sep_config/:battery_id', async (req, res) => {

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
router.post('/battery_electrolyte', async (req, res) => {

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
        electrolyte_total_ul || null
      ]
    );

    res.status(200).json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения электролита' });

  }

});

// Read electrolyte configuration
router.get('/battery_electrolyte/:battery_id', async (req, res) => {

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
router.patch('/battery_electrolyte/:battery_id', async (req, res) => {

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
router.post('/battery_qc', async (req, res) => {

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
        ocv_v || null,
        esr_mohm || null,
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
router.get('/battery_qc/:battery_id', async (req, res) => {

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
router.patch('/battery_qc/:battery_id', async (req, res) => {

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



// ---------- LOAD THE FULL BATTERY RECORD ----------

// Generates JSON
router.get('/:id/assembly', async (req, res) => {

  const batteryId = Number(req.params.id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {

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

        'electrode_sources',
        (
          SELECT row_to_json(es)
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