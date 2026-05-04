const { Router } = require('express');
const pool = require('../db/pool');
const router = Router();
const { auth, requireRole } = require('../middleware/auth');

async function getDepartmentById(id) {
  const result = await pool.query(`
    SELECT d.department_id, d.name,
           d.head_user_id, h.name AS head_name, h.position AS head_position
    FROM departments d
    LEFT JOIN users h ON h.user_id = d.head_user_id
    WHERE d.department_id = $1
  `, [id]);

  return result.rows[0] || null;
}

function normalizeDepartmentPayload(body = {}) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const rawHeadUserId = body.head_user_id;
  const headUserId = rawHeadUserId === '' || rawHeadUserId == null
    ? null
    : Number(rawHeadUserId);

  if (!name) {
    return { error: 'Название отдела обязательно' };
  }

  if (headUserId !== null && !Number.isInteger(headUserId)) {
    return { error: 'Некорректный руководитель отдела' };
  }

  return { name, headUserId };
}

async function validateHeadUser(headUserId) {
  if (headUserId === null) return null;

  const result = await pool.query(
    'SELECT user_id FROM users WHERE user_id = $1 AND active = true',
    [headUserId]
  );

  return result.rowCount > 0 ? null : 'Выберите активного пользователя';
}

// GET /api/departments — list all departments with head info
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT d.department_id, d.name,
             d.head_user_id, h.name AS head_name, h.position AS head_position
      FROM departments d
      LEFT JOIN users h ON h.user_id = d.head_user_id
      ORDER BY d.department_id
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/departments — create department (admin only)
router.post('/', auth, requireRole('admin'), async (req, res) => {
  const payload = normalizeDepartmentPayload(req.body);
  if (payload.error) {
    return res.status(400).json({ error: payload.error });
  }

  try {
    const headError = await validateHeadUser(payload.headUserId);
    if (headError) {
      return res.status(400).json({ error: headError });
    }

    const result = await pool.query(
      `INSERT INTO departments (name, head_user_id)
       VALUES ($1, $2)
       RETURNING department_id`,
      [payload.name, payload.headUserId]
    );

    const department = await getDepartmentById(result.rows[0].department_id);
    res.status(201).json(department);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/departments/:id — department with members
router.get('/:id', auth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    const deptResult = await pool.query(`
      SELECT d.department_id, d.name,
             d.head_user_id, h.name AS head_name, h.position AS head_position
      FROM departments d
      LEFT JOIN users h ON h.user_id = d.head_user_id
      WHERE d.department_id = $1
    `, [id]);

    if (deptResult.rowCount === 0) {
      return res.status(404).json({ error: 'Отдел не найден' });
    }

    const membersResult = await pool.query(`
      SELECT u.user_id, u.name, u.role, u.position, u.active
      FROM users u
      WHERE u.department_id = $1
      ORDER BY
        CASE u.role WHEN 'admin' THEN 0 WHEN 'lead' THEN 1 ELSE 2 END,
        u.name
    `, [id]);

    res.json({
      ...deptResult.rows[0],
      members: membersResult.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/departments/:id — update department (admin only)
router.put('/:id', auth, requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  const payload = normalizeDepartmentPayload(req.body);
  if (payload.error) {
    return res.status(400).json({ error: payload.error });
  }

  try {
    const existing = await getDepartmentById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Отдел не найден' });
    }

    const headError = await validateHeadUser(payload.headUserId);
    if (headError) {
      return res.status(400).json({ error: headError });
    }

    await pool.query(
      `UPDATE departments
       SET name = $1, head_user_id = $2
       WHERE department_id = $3`,
      [payload.name, payload.headUserId, id]
    );

    const department = await getDepartmentById(id);
    res.json(department);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
