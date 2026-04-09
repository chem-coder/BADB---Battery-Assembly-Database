const express = require('express');
const router = express.Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');
const { trackChanges } = require('../middleware/trackChanges');

router.get('/test', async (req, res) => {
  const result = await pool.query('SELECT 1 as ok');
  res.json(result.rows);
});

// ---------- ELECTROLYTES ----------

// CREATE electrolyte
// POST /api/electrolytes
router.post('/', auth, async (req, res) => {
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
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        e.electrolyte_id,
        e.name,
        e.electrolyte_type,
        e.created_by,
        u_created.name AS created_by_name,
        e.created_at,
        e.status,
        e.solvent_system,
        e.salts,
        e.concentration,
        e.additives,
        e.notes,
        e.updated_by,
        e.updated_at,
        u_updated.name AS updated_by_name
      FROM electrolytes e
      LEFT JOIN users u_created ON u_created.user_id = e.created_by
      LEFT JOIN users u_updated ON u_updated.user_id = e.updated_by
      ORDER BY e.name ASC;
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при получении электролитов' });
  }
});

router.get('/:id/files', auth, async (req, res) => {
  const electrolyteId = Number(req.params.id);

  if (!Number.isInteger(electrolyteId)) {
    return res.status(400).json({ error: 'Некорректный electrolyte_id' });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        electrolyte_file_id,
        electrolyte_id,
        file_name,
        mime_type,
        uploaded_at
      FROM electrolyte_files
      WHERE electrolyte_id = $1
      ORDER BY electrolyte_file_id
      `,
      [electrolyteId]
    );

    res.json(
      result.rows.map(row => ({
        ...row,
        download_url: `/api/electrolytes/files/${row.electrolyte_file_id}/download`
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки файлов электролита' });
  }
});

router.get('/files/:fileId/download', auth, async (req, res) => {
  const fileId = Number(req.params.fileId);

  if (!Number.isInteger(fileId)) {
    return res.status(400).json({ error: 'Некорректный идентификатор файла' });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        file_name,
        mime_type,
        file_data
      FROM electrolyte_files
      WHERE electrolyte_file_id = $1
      `,
      [fileId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Файл не найден' });
    }

    const file = result.rows[0];

    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(file.file_name || 'electrolyte-file')}`
    );
    res.send(file.file_data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка скачивания файла электролита' });
  }
});

router.post('/:id/files', auth, async (req, res) => {
  const electrolyteId = Number(req.params.id);
  const { entries } = req.body;

  if (!Number.isInteger(electrolyteId)) {
    return res.status(400).json({ error: 'Некорректный electrolyte_id' });
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: 'Не переданы файлы электролита' });
  }

  try {
    const electrolyteCheck = await pool.query(
      'SELECT electrolyte_id FROM electrolytes WHERE electrolyte_id = $1',
      [electrolyteId]
    );

    if (electrolyteCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Электролит не найден' });
    }

    for (const entry of entries) {
      if (!entry.file_content_base64) {
        throw new Error('Не передано содержимое файла');
      }

      await pool.query(
        `
        INSERT INTO electrolyte_files (
          electrolyte_id,
          file_name,
          mime_type,
          file_data
        )
        VALUES ($1,$2,$3,$4)
        `,
        [
          electrolyteId,
          entry.file_name || 'electrolyte_file',
          entry.mime_type || 'application/octet-stream',
          Buffer.from(entry.file_content_base64, 'base64')
        ]
      );
    }

    const result = await pool.query(
      `
      SELECT
        electrolyte_file_id,
        electrolyte_id,
        file_name,
        mime_type,
        uploaded_at
      FROM electrolyte_files
      WHERE electrolyte_id = $1
      ORDER BY electrolyte_file_id
      `,
      [electrolyteId]
    );

    res.status(200).json(
      result.rows.map(row => ({
        ...row,
        download_url: `/api/electrolytes/files/${row.electrolyte_file_id}/download`
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения файлов электролита' });
  }
});

router.delete('/files/:fileId', auth, async (req, res) => {
  const fileId = Number(req.params.fileId);

  if (!Number.isInteger(fileId)) {
    return res.status(400).json({ error: 'Некорректный идентификатор файла' });
  }

  try {
    const result = await pool.query(
      `
      DELETE FROM electrolyte_files
      WHERE electrolyte_file_id = $1
      RETURNING electrolyte_file_id
      `,
      [fileId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Файл не найден' });
    }

    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка удаления файла электролита' });
  }
});

// UPDATE electrolyte
// PUT /api/electrolytes/:id
router.put('/:id', auth, async (req, res) => {
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
    const current = await pool.query(
      'SELECT name, electrolyte_type, solvent_system, salts, concentration, additives, notes, status FROM electrolytes WHERE electrolyte_id = $1',
      [electrolyteId]
    );
    if (current.rowCount === 0) {
      return res.status(404).json({ error: 'Электролит не найден' });
    }

    const newVals = { name, electrolyte_type, solvent_system: solvent_system || null, salts: salts || null, concentration: concentration || null, additives: additives || null, notes: notes || null, status: status != null ? status : current.rows[0].status };

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
        status = COALESCE($8, status),
        updated_by = $9,
        updated_at = now()
      WHERE electrolyte_id = $10
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
        req.user.userId,
        electrolyteId
      ]
    );

    await trackChanges(pool, 'electrolyte', 'electrolytes', 'electrolyte_id', electrolyteId, current.rows[0], newVals, req.user.userId);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при обновлении электролита' });
  }
});

// DELETE electrolyte
// DELETE /api/electrolytes/:id
router.delete('/:id', auth, async (req, res) => {
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
