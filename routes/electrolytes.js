const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/test', async (req, res) => {
  const result = await pool.query('SELECT 1 as ok');
  res.json(result.rows);
});

// ---------- ELECTROLYTES ----------

// CREATE electrolyte
// POST /api/electrolytes
router.post('/', async (req, res) => {
  const {
    name,
    electrolyte_type,
    solvent_system,
    salts,
    concentration,
    additives,
    notes,
    status = 'active',
    created_by
  } = req.body;

  if (!name || !electrolyte_type || !created_by) {
    return res.status(400).json({ error: 'Обязательные поля отсутствуют' });
  }

  const allowedStatus = ['active','inactive','archived'];
  if (!allowedStatus.includes(status)) {
    return res.status(400).json({ error: 'Некорректный статус электролита' });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO electrolytes (
        name,
        electrolyte_type,
        solvent_system,
        salts,
        concentration,
        additives,
        notes,
        status,
        created_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
      `,
      [
        name,
        electrolyte_type,
        solvent_system || null,
        salts || null,
        concentration || null,
        additives || null,
        notes || null,
        status,
        created_by
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при создании электролита' });
  }
});

// READ all electrolytes (global list)
// GET /api/electrolytes
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        e.electrolyte_id,
        e.name,
        e.electrolyte_type,
        e.created_by,
        u.name AS created_by_name,
        e.created_at,
        e.status,
        e.solvent_system,
        e.salts,
        e.concentration,
        e.additives,
        e.notes
      FROM electrolytes e
      JOIN users u ON u.user_id = e.created_by
      ORDER BY e.name ASC;
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при получении электролитов' });
  }
});

// UPDATE electrolyte
// PUT /api/electrolytes/:id
router.put('/:id', async (req, res) => {
  const electrolyteId = Number(req.params.id);

  if (!Number.isInteger(electrolyteId)) {
    return res.status(400).json({ error: 'Некорректный electrolyte_id' });
  }

  const {
    name,
    electrolyte_type,
    solvent_system,
    salts,
    concentration,
    additives,
    notes,
    status
  } = req.body;

  try {
    const result = await pool.query(
      `
      UPDATE electrolytes
      SET
        name = $1,
        electrolyte_type = $2,
        solvent_system = $3,
        salts = $4,
        concentration = $5,
        additives = $6,
        notes = $7,
        status = COALESCE($8, status)
      WHERE electrolyte_id = $9
      RETURNING *
      `,
      [
        name,
        electrolyte_type,
        solvent_system || null,
        salts || null,
        concentration || null,
        additives || null,
        notes || null,
        status,
        electrolyteId
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при обновлении электролита' });
  }
});

// DELETE electrolyte
// DELETE /api/electrolytes/:id
router.delete('/:id', async (req, res) => {
  const electrolyteId = Number(req.params.id);

  if (!Number.isInteger(electrolyteId)) {
    return res.status(400).json({ error: 'Некорректный electrolyte_id' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM electrolytes WHERE electrolyte_id = $1',
      [electrolyteId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Электролит не найден' });
    }

    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка удаления электролита' });
  }
});


module.exports = router;