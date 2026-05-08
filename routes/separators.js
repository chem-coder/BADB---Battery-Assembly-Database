const express = require('express');
const router = express.Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');
const { trackChanges } = require('../middleware/trackChanges');
const {
  collectDependencyConflicts,
  sendDependencyConflict,
  sendForeignKeyConflict
} = require('../utils/dependencyConflicts');

router.get('/test', async (req, res) => {
  const result = await pool.query('SELECT 1 as ok');
  res.json(result.rows);
});


// -------- SEPARATORS --------

const ALLOWED_SEPARATOR_STATUSES = ['available', 'used', 'scrap'];

function statusError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function optionalText(value) {
  if (value == null) return null;

  const text = String(value).trim();
  return text === '' ? null : text;
}

function optionalNumber(value, label) {
  if (value == null || value === '') return null;

  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw statusError(`${label} должно быть числом`, 400);
  }

  return number;
}

function optionalDate(value, label) {
  if (value == null || value === '') return null;

  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw statusError(`${label}: укажите дату в формате ГГГГ-ММ-ДД`, 400);
  }

  return text;
}

function getSeparatorWriteError(err) {
  if (err.statusCode) {
    return { statusCode: err.statusCode, message: err.message };
  }

  if (err.code === '23505' && err.constraint === 'separators_name_batch_key') {
    return {
      statusCode: 409,
      message: 'Сепаратор с таким названием и партией уже существует.'
    };
  }

  if (err.code === '23503' && err.constraint === 'separators_structure_id_fkey') {
    return {
      statusCode: 400,
      message: 'Выберите существующий тип структуры сепаратора.'
    };
  }

  if (err.code === '22P02' || err.code === '22007' || err.code === '22008') {
    return {
      statusCode: 400,
      message: 'Проверьте числовые поля и дату списания сепаратора.'
    };
  }

  return null;
}

async function collectSeparatorDeleteDependencies(db, separatorId) {
  return collectDependencyConflicts(db, [
    {
      key: 'battery_sep_config',
      label: 'аккумуляторы с этим сепаратором',
      query: `
        SELECT b.battery_id AS id, b.battery_notes AS name
        FROM battery_sep_config bsc
        JOIN batteries b ON b.battery_id = bsc.battery_id
        WHERE bsc.separator_id = $1
        ORDER BY b.battery_id
        LIMIT 25
      `,
      params: [separatorId]
    }
  ]);
}

async function getSeparatorDeleteCheck(db, separatorId) {
  const exists = await db.query(
    'SELECT sep_id FROM separators WHERE sep_id = $1',
    [separatorId]
  );

  if (exists.rowCount === 0) {
    throw statusError('Сепаратор не найден', 404);
  }

  const dependencies = await collectSeparatorDeleteDependencies(db, separatorId);

  return {
    sep_id: separatorId,
    can_delete: dependencies.length === 0,
    message: dependencies.length > 0
      ? 'Нельзя удалить сепаратор: он используется в аккумуляторах.'
      : '',
    dependencies
  };
}

async function getSeparatorReport(db, separatorId) {
  const separatorResult = await db.query(
    `
    SELECT
      s.sep_id,
      s.name,
      s.supplier,
      s.brand,
      s.batch,
      s.structure_id,
      ss.name AS structure_name,
      s.air_perm,
      s.air_perm_units,
      s.thickness_um,
      s.porosity,
      s.comments,
      s.status,
      s.depleted_at,
      s.file_path,
      s.created_by,
      s.created_at,
      u_created.name AS created_by_name,
      s.updated_by,
      s.updated_at,
      u_updated.name AS updated_by_name
    FROM separators s
    LEFT JOIN separator_structure ss ON ss.sep_str_id = s.structure_id
    LEFT JOIN users u_created ON u_created.user_id = s.created_by
    LEFT JOIN users u_updated ON u_updated.user_id = s.updated_by
    WHERE s.sep_id = $1
    `,
    [separatorId]
  );

  if (separatorResult.rowCount === 0) {
    throw statusError('Сепаратор не найден', 404);
  }

  const filesResult = await db.query(
    `
    SELECT
      separator_file_id,
      sep_id,
      file_name,
      mime_type,
      octet_length(file_data) AS file_size_bytes,
      uploaded_at
    FROM separator_files
    WHERE sep_id = $1
    ORDER BY separator_file_id
    `,
    [separatorId]
  );

  return {
    separator: separatorResult.rows[0],
    files: filesResult.rows.map(row => ({
      ...row,
      download_url: `/api/separators/files/${row.separator_file_id}/download`
    }))
  };
}

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
  const created_by = req.user.userId;
  let cleanPayload;

  // 1. validate required strings
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Название сепаратора обязательно' });
  }

  // 2. validate required foreign keys
  if (!Number.isInteger(structure_id) || structure_id <= 0) {
    return res.status(400).json({ error: 'Выберите тип структуры сепаратора' });
  }

  if (!ALLOWED_SEPARATOR_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Некорректный статус сепаратора' });
  }

  try {
    cleanPayload = {
      name: name.trim(),
      supplier: optionalText(supplier),
      brand: optionalText(brand),
      batch: optionalText(batch),
      structure_id,
      air_perm: optionalNumber(air_perm, 'Воздушная проницаемость'),
      air_perm_units: optionalText(air_perm_units),
      thickness_um: optionalNumber(thickness_um, 'Толщина'),
      porosity: optionalNumber(porosity, 'Пористость'),
      comments: optionalText(comments),
      status,
      depleted_at: status === 'available' ? null : optionalDate(depleted_at, 'Дата списания'),
      created_by,
      file_path: optionalText(file_path)
    };
  } catch (err) {
    const writeError = getSeparatorWriteError(err);
    return res.status(writeError?.statusCode || 400).json({
      error: writeError?.message || 'Проверьте поля сепаратора'
    });
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
      RETURNING *
      `,
      [
        cleanPayload.name,
        cleanPayload.supplier,
        cleanPayload.brand,
        cleanPayload.batch,
        cleanPayload.structure_id,
        cleanPayload.air_perm,
        cleanPayload.air_perm_units,
        cleanPayload.thickness_um,
        cleanPayload.porosity,
        cleanPayload.comments,
        cleanPayload.status,
        cleanPayload.depleted_at,
        cleanPayload.created_by,
        cleanPayload.file_path
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    const writeError = getSeparatorWriteError(err);
    if (writeError) {
      return res.status(writeError.statusCode).json({ error: writeError.message });
    }

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
        s.file_path,
        s.created_by,
        s.created_at,
        u_created.name AS created_by_name,
        s.updated_by,
        s.updated_at,
        u_updated.name AS updated_by_name,
        ss.name AS structure_name
      FROM separators s
      LEFT JOIN separator_structure ss ON ss.sep_str_id = s.structure_id
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

router.get('/:id/report', auth, async (req, res) => {
  const separatorId = Number(req.params.id);

  if (!Number.isInteger(separatorId)) {
    return res.status(400).json({ error: 'Некорректный sep_id' });
  }

  try {
    const report = await getSeparatorReport(pool, separatorId);
    res.json(report);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }

    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки отчёта по сепаратору' });
  }
});

router.get('/:id/delete-check', auth, async (req, res) => {
  const separatorId = Number(req.params.id);

  if (!Number.isInteger(separatorId)) {
    return res.status(400).json({ error: 'Некорректный sep_id' });
  }

  try {
    const check = await getSeparatorDeleteCheck(pool, separatorId);
    res.json(check);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }

    console.error(err);
    res.status(500).json({ error: 'Ошибка проверки удаления сепаратора' });
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

  if (!Number.isInteger(structure_id) || structure_id <= 0) {
    return res.status(400).json({ error: 'Выберите тип структуры сепаратора' });
  }

  const cleanName = name.trim();
  const cleanStatus = status || 'available';

  if (!ALLOWED_SEPARATOR_STATUSES.includes(cleanStatus)) {
    return res.status(400).json({ error: 'Некорректный статус сепаратора' });
  }

  let newVals;

  try {
    newVals = {
      name: cleanName,
      supplier: optionalText(supplier),
      brand: optionalText(brand),
      batch: optionalText(batch),
      structure_id,
      air_perm: optionalNumber(air_perm, 'Воздушная проницаемость'),
      air_perm_units: optionalText(air_perm_units),
      thickness_um: optionalNumber(thickness_um, 'Толщина'),
      porosity: optionalNumber(porosity, 'Пористость'),
      comments: optionalText(comments),
      status: cleanStatus,
      depleted_at: cleanStatus === 'available' ? null : optionalDate(depleted_at, 'Дата списания'),
      file_path: optionalText(file_path)
    };
  } catch (err) {
    const writeError = getSeparatorWriteError(err);
    return res.status(writeError?.statusCode || 400).json({
      error: writeError?.message || 'Проверьте поля сепаратора'
    });
  }

  try {
    const current = await pool.query(
      'SELECT name, supplier, brand, batch, structure_id, air_perm, air_perm_units, thickness_um, porosity, comments, status, depleted_at, file_path FROM separators WHERE sep_id = $1',
      [id]
    );
    if (current.rowCount === 0) {
      return res.status(404).json({ error: 'Сепаратор не найден' });
    }

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
    const writeError = getSeparatorWriteError(err);
    if (writeError) {
      return res.status(writeError.statusCode).json({ error: writeError.message });
    }

    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE
router.delete('/:id', auth, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Некорректный sep_id' });
  }

  try {
    const dependencies = await collectSeparatorDeleteDependencies(pool, id);

    if (dependencies.length > 0) {
      return sendDependencyConflict(
        res,
        'Нельзя удалить сепаратор: он используется в аккумуляторах',
        dependencies
      );
    }

    const result = await pool.query(
      'DELETE FROM separators WHERE sep_id = $1',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Сепаратор не найден' });
    }

    res.status(204).end();
  } catch (err) {
    if (sendForeignKeyConflict(res, err, 'Нельзя удалить сепаратор: он связан с другими записями')) {
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


module.exports = router;
