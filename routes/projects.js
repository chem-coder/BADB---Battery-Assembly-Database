const express = require('express');
const router = express.Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');
const { trackChanges } = require('../middleware/trackChanges');

router.get('/test', async (req, res) => {
  const result = await pool.query('SELECT 1 as ok');
  res.json(result.rows);
});


// -------- PROJECTS --------

const VALID_CONFIDENTIALITY = ['public', 'department', 'confidential'];

// CREATE
router.post('/', auth, async (req, res) => {
  const {
    name,
    created_by,
    lead_id,
    start_date,
    due_date,
    status = 'active',
    description,
    confidentiality_level,
    department_id
  } = req.body;

  const createdBy = Number(created_by);
  const leadId = lead_id ? Number(lead_id) : null;
  const deptId = department_id ? Number(department_id) : null;
  const confLevel = confidentiality_level || 'public';

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

  if (deptId !== null && !Number.isInteger(deptId)) {
    return res.status(400).json({ error: 'Некорректный отдел' });
  }

  // 4. validate confidentiality level
  if (!VALID_CONFIDENTIALITY.includes(confLevel)) {
    return res.status(400).json({ error: 'Некорректный уровень доступа' });
  }

  // 5. department_id required when level === 'department'
  if (confLevel === 'department' && !deptId) {
    return res.status(400).json({ error: 'Укажите отдел для уровня «Отдел»' });
  }

  // Enforce: department_id only meaningful for 'department' level
  const finalDeptId = confLevel === 'department' ? deptId : null;

  try {
    const result = await pool.query(
      `
      INSERT INTO projects
        (name, created_by, lead_id, start_date, due_date, status, description,
         confidentiality_level, department_id)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING project_id
      `,
      [
        name.trim(),
        createdBy,
        leadId,
        start_date || null,
        due_date || null,
        status,
        description || null,
        confLevel,
        finalDeptId
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
               d.name AS department_name,
               u_created.name AS created_by_name,
               p.updated_by,
               p.updated_at,
               u_updated.name AS updated_by_name
        FROM projects p
        LEFT JOIN users u ON p.lead_id = u.user_id
        LEFT JOIN departments d ON d.department_id = p.department_id
        LEFT JOIN users u_created ON u_created.user_id = p.created_by
        LEFT JOIN users u_updated ON u_updated.user_id = p.updated_by
        ORDER BY p.name
      `);
      return res.json(result.rows);
    }

    // Everyone else: public + own department + explicit access
    const result = await pool.query(`
      SELECT DISTINCT p.project_id, p.name, p.created_by, p.lead_id,
             u.name AS lead_name, p.start_date, p.due_date,
             p.status, p.description, p.confidentiality_level, p.department_id,
             d.name AS department_name,
             u_created.name AS created_by_name,
             p.updated_by,
             p.updated_at,
             u_updated.name AS updated_by_name
      FROM projects p
      LEFT JOIN users u ON p.lead_id = u.user_id
      LEFT JOIN departments d ON d.department_id = p.department_id
      LEFT JOIN users u_created ON u_created.user_id = p.created_by
      LEFT JOIN users u_updated ON u_updated.user_id = p.updated_by
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
router.put('/:id', auth, async (req, res) => {
  const { id } = req.params;
  const {
    name,
    lead_id,
    start_date,
    due_date,
    status,
    description,
    confidentiality_level,
    department_id
  } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Название проекта обязательно' });
  }

  // Validate confidentiality level if provided
  if (confidentiality_level !== undefined && !VALID_CONFIDENTIALITY.includes(confidentiality_level)) {
    return res.status(400).json({ error: 'Некорректный уровень доступа' });
  }

  // department_id required when level === 'department'
  if (confidentiality_level === 'department' && !department_id) {
    return res.status(400).json({ error: 'Укажите отдел для уровня «Отдел»' });
  }

  try {
    const current = await pool.query(
      'SELECT name, lead_id, start_date, due_date, status, description, confidentiality_level, department_id FROM projects WHERE project_id = $1',
      [id]
    );
    if (current.rowCount === 0) {
      return res.status(404).json({ error: 'Проект не найден' });
    }

    const finalConfLevel = confidentiality_level !== undefined ? confidentiality_level : current.rows[0].confidentiality_level;
    let finalDeptId;
    if (department_id !== undefined) {
      finalDeptId = department_id ? Number(department_id) : null;
    } else {
      finalDeptId = current.rows[0].department_id;
    }
    // Enforce: department_id only meaningful for 'department' level
    if (finalConfLevel !== 'department') {
      finalDeptId = null;
    }

    const newVals = {
      name: name.trim(),
      lead_id: lead_id || null,
      start_date: start_date || null,
      due_date: due_date || null,
      status: status || 'active',
      description: description || null,
      confidentiality_level: finalConfLevel,
      department_id: finalDeptId,
    };

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
        confidentiality_level = $7,
        department_id = $8,
        updated_by = $9,
        updated_at = now()
      WHERE project_id = $10
      RETURNING *
      `,
      [
        newVals.name,
        newVals.lead_id,
        newVals.start_date,
        newVals.due_date,
        newVals.status,
        newVals.description,
        newVals.confidentiality_level,
        newVals.department_id,
        req.user.userId,
        id
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Проект не найден' });
    }

    await trackChanges(pool, 'project', 'projects', 'project_id', Number(id), current.rows[0], newVals, req.user.userId);

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



// -------- PROJECT ACCESS MANAGEMENT --------

// GET /api/projects/:id/access — list users with access to project
router.get('/:id/access', auth, async (req, res) => {
  const projectId = Number(req.params.id);
  if (!Number.isInteger(projectId)) return res.status(400).json({ error: 'Некорректный ID' });

  try {
    const result = await pool.query(`
      SELECT upa.user_id, u.name, u.role, u.position, u.department_id,
             d.name AS department_name, upa.access_level, upa.granted_at,
             g.name AS granted_by_name
      FROM user_project_access upa
      JOIN users u ON u.user_id = upa.user_id
      LEFT JOIN departments d ON d.department_id = u.department_id
      LEFT JOIN users g ON g.user_id = upa.granted_by
      WHERE upa.project_id = $1
      ORDER BY u.name
    `, [projectId]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/projects/:id/access — grant access to user
router.post('/:id/access', auth, async (req, res) => {
  const projectId = Number(req.params.id);
  const { user_id, access_level = 'view' } = req.body;
  const userId = Number(user_id);

  if (!Number.isInteger(projectId) || !Number.isInteger(userId)) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }
  if (!['view', 'edit', 'admin'].includes(access_level)) {
    return res.status(400).json({ error: 'Некорректный уровень доступа' });
  }

  try {
    await pool.query(`
      INSERT INTO user_project_access (user_id, project_id, granted_by, access_level)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, project_id) DO UPDATE SET
        access_level = EXCLUDED.access_level,
        granted_by = EXCLUDED.granted_by,
        granted_at = now()
    `, [userId, projectId, req.user.userId, access_level]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/projects/:id/access/:userId — revoke access
router.delete('/:id/access/:userId', auth, async (req, res) => {
  const projectId = Number(req.params.id);
  const userId = Number(req.params.userId);

  if (!Number.isInteger(projectId) || !Number.isInteger(userId)) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
    await pool.query(
      'DELETE FROM user_project_access WHERE user_id = $1 AND project_id = $2',
      [userId, projectId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;