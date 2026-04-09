const express = require('express');
const router = express.Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');
const { trackChanges } = require('../middleware/trackChanges');

router.get('/test', async (req, res) => {
  const result = await pool.query('SELECT 1 as ok');
  res.json(result.rows);
});


// -------- SEPARATORS --------

// CREATE
router.post('/', auth, async (req, res) => {
  const {
    name,
    supplier,
    brand,
    batch,
    air_perm,
    air_perm_units,
    thickness_um,
    porosity,
    comments,
    status = 'available',
    depleted_at,
    file_path
  } = req.body;

  const structure_id = Number(req.body.structure_id);
  const created_by  = Number(req.body.created_by);

  // 1. validate required strings
  if (!name) {
    return res.status(400).json({ error: 'Обязательные поля отсутствуют' });
  }

  // 2. validate required foreign keys
  if (!Number.isInteger(structure_id) || !Number.isInteger(created_by)) {
    return res.status(400).json({ error: 'Некорректные идентификаторы' });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO separators (
        name, supplier, brand, batch,
        structure_id,
        air_perm, air_perm_units,
        thickness_um, porosity,
        comments,
        status, depleted_at,
        created_by,
        file_path
      )
      VALUES (
        $1,$2,$3,$4,
        $5,
        $6,$7,
        $8,$9,
        $10,
        $11,$12,
        $13,
        $14
      )
      RETURNING sep_id
      `,
      [
        name.trim(),
        supplier || null,
        brand || null,
        batch || null,
        structure_id,
        air_perm ?? null,
        air_perm_units || null,
        thickness_um ?? null,
        porosity ?? null,
        comments || null,
        status,
        depleted_at || null,
        created_by,
        file_path || null
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
  try {
    const result = await pool.query(`
      SELECT
        s.sep_id,
        s.name,
        s.supplier,
        s.brand,
        s.batch,
        s.structure_id,
        s.air_perm,
        s.air_perm_units,
        s.thickness_um,
        s.porosity,
        s.comments,
        s.status,
        s.depleted_at,
        s.created_by,
        u_created.name AS created_by_name,
        s.updated_by,
        s.updated_at,
        u_updated.name AS updated_by_name
      FROM separators s
      LEFT JOIN users u_created ON u_created.user_id = s.created_by
      LEFT JOIN users u_updated ON u_updated.user_id = s.updated_by
      ORDER BY s.name;
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/:id/files', auth, async (req, res) => {
  const separatorId = Number(req.params.id);

  if (!Number.isInteger(separatorId)) {
    return res.status(400).json({ error: 'Некорректный sep_id' });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        separator_file_id,
        sep_id,
        file_name,
        mime_type,
        uploaded_at
      FROM separator_files
      WHERE sep_id = $1
      ORDER BY separator_file_id
      `,
      [separatorId]
    );

    res.json(
      result.rows.map(row => ({
        ...row,
        download_url: `/api/separators/files/${row.separator_file_id}/download`
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки файлов сепаратора' });
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
      FROM separator_files
      WHERE separator_file_id = $1
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
      `inline; filename*=UTF-8''${encodeURIComponent(file.file_name || 'separator-file')}`
    );
    res.send(file.file_data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка скачивания файла сепаратора' });
  }
});

router.post('/:id/files', auth, async (req, res) => {
  const separatorId = Number(req.params.id);
  const { entries } = req.body;

  if (!Number.isInteger(separatorId)) {
    return res.status(400).json({ error: 'Некорректный sep_id' });
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: 'Не переданы файлы сепаратора' });
  }

  try {
    const separatorCheck = await pool.query(
      'SELECT sep_id FROM separators WHERE sep_id = $1',
      [separatorId]
    );

    if (separatorCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Сепаратор не найден' });
    }

    for (const entry of entries) {
      if (!entry.file_content_base64) {
        throw new Error('Не передано содержимое файла');
      }

      await pool.query(
        `
        INSERT INTO separator_files (
          sep_id,
          file_name,
          mime_type,
          file_data
        )
        VALUES ($1,$2,$3,$4)
        `,
        [
          separatorId,
          entry.file_name || 'separator_file',
          entry.mime_type || 'application/octet-stream',
          Buffer.from(entry.file_content_base64, 'base64')
        ]
      );
    }

    const result = await pool.query(
      `
      SELECT
        separator_file_id,
        sep_id,
        file_name,
        mime_type,
        uploaded_at
      FROM separator_files
      WHERE sep_id = $1
      ORDER BY separator_file_id
      `,
      [separatorId]
    );

    res.status(200).json(
      result.rows.map(row => ({
        ...row,
        download_url: `/api/separators/files/${row.separator_file_id}/download`
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения файлов сепаратора' });
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
      DELETE FROM separator_files
      WHERE separator_file_id = $1
      RETURNING separator_file_id
      `,
      [fileId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Файл не найден' });
    }

    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка удаления файла сепаратора' });
  }
});

// UPDATE
router.put('/:id', auth, async (req, res) => {
  const { id } = req.params;

  const {
    name,
    supplier,
    brand,
    batch,
    air_perm,
    air_perm_units,
    thickness_um,
    porosity,
    comments,
    status,
    depleted_at,
    file_path
  } = req.body;

  const structure_id = Number(req.body.structure_id);

  // ---- validation ----
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Название сепаратора обязательно' });
  }

  if (!Number.isInteger(structure_id)) {
    return res.status(400).json({ error: 'Некорректная структура' });
  }

  const cleanName = name.trim();

  const cleanDepletedAt =
    status === 'available' ? null : (depleted_at || null);

  try {
    const current = await pool.query(
      'SELECT name, supplier, brand, batch, structure_id, air_perm, air_perm_units, thickness_um, porosity, comments, status, depleted_at, file_path FROM separators WHERE sep_id = $1',
      [id]
    );
    if (current.rowCount === 0) {
      return res.status(404).json({ error: 'Сепаратор не найден' });
    }

    const newVals = { name: cleanName, supplier: supplier || null, brand: brand || null, batch: batch || null, structure_id, air_perm: air_perm ?? null, air_perm_units: air_perm_units || null, thickness_um: thickness_um ?? null, porosity: porosity ?? null, comments: comments || null, status: status || 'available', depleted_at: cleanDepletedAt, file_path: file_path || null };

    const result = await pool.query(
      `
      UPDATE separators
      SET
        name = $1,
        supplier = $2,
        brand = $3,
        batch = $4,
        structure_id = $5,
        air_perm = $6,
        air_perm_units = $7,
        thickness_um = $8,
        porosity = $9,
        comments = $10,
        status = $11,
        depleted_at = $12,
        file_path = $13,
        updated_by = $14,
        updated_at = now()
      WHERE sep_id = $15
      RETURNING *
      `,
      [
        newVals.name, newVals.supplier, newVals.brand, newVals.batch,
        newVals.structure_id, newVals.air_perm, newVals.air_perm_units,
        newVals.thickness_um, newVals.porosity, newVals.comments,
        newVals.status, newVals.depleted_at, newVals.file_path,
        req.user.userId, id
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Сепаратор не найден' });
    }

    await trackChanges(pool, 'separator', 'separators', 'sep_id', Number(id), current.rows[0], newVals, req.user.userId);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE
router.delete('/:id', auth, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM separators WHERE sep_id = $1',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Сепаратор не найден' });
    }

    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


module.exports = router;
