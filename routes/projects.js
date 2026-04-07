const express = require('express');
const router = express.Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');

router.get('/test', async (req, res) => {
  const result = await pool.query('SELECT 1 as ok');
  res.json(result.rows);
});


// -------- PROJECTS --------

// CREATE
router.post('/', async (req, res) => {
  const {
    name,
    created_by,
    lead_id,
    start_date,
    due_date,
    status = 'active',
    description
  } = req.body;

  const createdBy = Number(created_by);
  const leadId = lead_id ? Number(lead_id) : null;

  // 1. validate required strings
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Название проекта обязательно' });
  }

  // 2. validate required foreign keys
  if (!Number.isInteger(createdBy)) {
    return res.status(400).json({ error: 'Некорректные идентификаторы' });
  }

  // 3. validate optional foreign keys
  if (leadId !== null && !Number.isInteger(leadId)) {
    return res.status(400).json({ error: 'Некорректный руководитель' });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO projects
        (name, created_by, lead_id, start_date, due_date, status, description)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7)
      RETURNING project_id
      `,
      [
        name.trim(),
        createdBy,
        leadId,
        start_date || null,
        due_date || null,
        status,
        description || null
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// READ — filtered by user access + confidentiality
router.get('/', auth, async (req, res) => {
  try {
    // Get user's department
    const userRow = await pool.query(
      `SELECT u.department_id, u.role, u.position,
              (d.head_user_id = u.user_id) AS is_department_head
       FROM users u
       LEFT JOIN departments d ON d.department_id = u.department_id
       WHERE u.user_id = $1`,
      [req.user.userId]
    );
    const me = userRow.rows[0] || {};
    const isDirector = (me.position || '').toLowerCase().includes('директор');
    const isAdmin = me.role === 'admin';

    // Director and admin see everything
    if (isDirector || isAdmin) {
      const result = await pool.query(`
        SELECT p.project_id, p.name, p.created_by, p.lead_id,
               u.name AS lead_name, p.start_date, p.due_date,
               p.status, p.description, p.confidentiality_level, p.department_id,
               d.name AS department_name
        FROM projects p
        LEFT JOIN users u ON p.lead_id = u.user_id
        LEFT JOIN departments d ON d.department_id = p.department_id
        ORDER BY p.name
      `);
      return res.json(result.rows);
    }

    // Everyone else: public + own department + explicit access
    const result = await pool.query(`
      SELECT DISTINCT p.project_id, p.name, p.created_by, p.lead_id,
             u.name AS lead_name, p.start_date, p.due_date,
             p.status, p.description, p.confidentiality_level, p.department_id,
             d.name AS department_name
      FROM projects p
      LEFT JOIN users u ON p.lead_id = u.user_id
      LEFT JOIN departments d ON d.department_id = p.department_id
      WHERE
        p.confidentiality_level = 'public'
        OR (p.confidentiality_level = 'department' AND p.department_id = $1)
        OR EXISTS (
          SELECT 1 FROM user_project_access upa
          WHERE upa.project_id = p.project_id AND upa.user_id = $2
        )
      ORDER BY p.name
    `, [me.department_id, req.user.userId]);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// UPDATE
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const {
    name,
    lead_id,
    start_date,
    due_date,
    status,
    description
  } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Название проекта обязательно' });
  }

  try {
    const result = await pool.query(
      `
      UPDATE projects
      SET
        name = $1,
        lead_id = $2,
        start_date = $3,
        due_date = $4,
        status = $5,
        description = $6,
        updated_at = now()
      WHERE project_id = $7
      RETURNING *
      `,
      [
        name.trim(),
        lead_id || null,
        start_date || null,
        due_date || null,
        status || 'active',
        description || null,
        id
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Проект не найден' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM projects WHERE project_id = $1',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Проект не найден' });
    }

    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});



module.exports = router;