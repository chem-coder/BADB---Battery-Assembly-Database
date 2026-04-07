const { Router } = require('express');
const pool = require('../db/pool');
const { auth, requireRole } = require('../middleware/auth');
const router = Router();


// -------- USERS --------

// CREATE — lead: can add employees only; admin: can add any role
router.post('/', auth, requireRole('admin', 'lead'), async (req, res) => {
  const { name, role, position, department_id } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Имя пользователя обязательно' });
  }

  // Lead cannot create lead/admin users
  const targetRole = role || 'employee';
  if (req.user.role !== 'admin' && targetRole !== 'employee') {
    return res.status(403).json({ error: 'Только администратор может добавлять руководителей' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO users (name, role, position, department_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, targetRole, position || null, department_id || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Пользователь уже существует' });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// READ — no auth required (reference data)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.user_id, u.name, u.active, u.role, u.position,
              u.department_id, d.name AS department_name
       FROM users u
       LEFT JOIN departments d ON d.department_id = u.department_id
       ORDER BY u.name`);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// UPDATE — lead: can edit but not promote to lead/admin; admin: full access
router.put('/:id', auth, requireRole('admin', 'lead'), async (req, res) => {
  const { id } = req.params;
  const { name, active, role, position, department_id } = req.body;

  if (!name || typeof active !== 'boolean') {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  // Lead cannot assign lead/admin role
  if (req.user.role !== 'admin' && role && role !== 'employee') {
    return res.status(403).json({ error: 'Только администратор может назначать роль руководителя' });
  }

  try {
    const result = await pool.query(
      `UPDATE users SET name = $1, active = $2, role = COALESCE($3, role),
              position = COALESCE($4, position), department_id = COALESCE($5, department_id)
       WHERE user_id = $6 RETURNING *`,
      [name, active, role || null, position || null, department_id || null, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Пользователь с таким именем уже существует' });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE — admin only
router.delete('/:id', auth, requireRole('admin'), async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query('DELETE FROM users WHERE user_id = $1', [id]);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


module.exports = router;
