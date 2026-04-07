const { Router } = require('express');
const pool = require('../db/pool');
const { auth, requireRole } = require('../middleware/auth');
const router = Router();

// GET /api/activity — activity journal (admin/lead)
router.get('/', auth, requireRole('admin', 'lead'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const offset = Number(req.query.offset) || 0;

  try {
    const result = await pool.query(`
      SELECT al.id, al.user_id, al.action, al.entity, al.entity_id,
             al.details, al.ip_address, al.created_at,
             u.name AS user_name, d.name AS department_name
      FROM activity_log al
      LEFT JOIN users u ON u.user_id = al.user_id
      LEFT JOIN departments d ON d.department_id = u.department_id
      ORDER BY al.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const countResult = await pool.query('SELECT COUNT(*) AS total FROM activity_log');

    res.json({
      rows: result.rows,
      total: parseInt(countResult.rows[0].total, 10),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/activity — log an action (internal use, auth required)
router.post('/', auth, async (req, res) => {
  const { action, entity, entity_id, details } = req.body;

  if (!action || !entity) {
    return res.status(400).json({ error: 'action and entity required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO activity_log (user_id, action, entity, entity_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [req.user.userId, action, entity, entity_id || null, details ? JSON.stringify(details) : null, req.ip]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
