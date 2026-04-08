const { Router } = require('express');
const pool = require('../db/pool');
const router = Router();
const { auth } = require('../middleware/auth');

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

module.exports = router;
