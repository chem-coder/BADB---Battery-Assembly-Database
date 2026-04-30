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


// -------- PROJECTS --------

const VALID_CONFIDENTIALITY = ['public', 'department', 'confidential'];

// ── Authorization helpers ─────────────────────────────────────────────
// Determines who can MODIFY a project (edit, delete, manage access).
// Returns: { exists: boolean, level: 'admin'|'director'|'owner'|'project-admin'|null }
async function checkModifyPermission(db, projectId, user) {
  // First verify the project exists (needed even for admins so we return 404 not 500)
  const projCheck = await db.query('SELECT created_by FROM projects WHERE project_id = $1', [projectId]);
  if (projCheck.rowCount === 0) {
    return { exists: false, level: null };
  }
  const projCreatedBy = projCheck.rows[0].created_by;

  // Admins can always modify (but only existing projects)
  if (user.role === 'admin') return { exists: true, level: 'admin' };

  // Fetch user context + explicit access level
  const r = await db.query(`
    SELECT u.position AS user_position,
           (SELECT access_level FROM user_project_access
            WHERE project_id = $1 AND user_id = $2) AS explicit_level
    FROM users u WHERE u.user_id = $2
  `, [projectId, user.userId]);

  if (r.rowCount === 0) return { exists: true, level: null };

  const row = r.rows[0];
  // Director (position contains 'директор') can modify anything
  if ((row.user_position || '').toLowerCase().includes('директор')) return { exists: true, level: 'director' };
  // Project creator can modify their own project
  if (projCreatedBy === user.userId) return { exists: true, level: 'owner' };
  // User with 'admin' access_level on this project can modify
  if (row.explicit_level === 'admin') return { exists: true, level: 'project-admin' };

  return { exists: true, level: null };
}

// Determines if a user can VIEW a project (see its details, access list).
// Uses the same filter logic as GET /api/projects but for a single project.
// Returns: { exists: boolean, allowed: boolean }
async function checkViewPermission(db, projectId, user) {
  // Verify project exists first
  const projCheck = await db.query('SELECT 1 FROM projects WHERE project_id = $1', [projectId]);
  if (projCheck.rowCount === 0) return { exists: false, allowed: false };

  // Admins can always view existing projects
  if (user.role === 'admin') return { exists: true, allowed: true };

  const r = await db.query(`
    SELECT
      p.confidentiality_level,
      p.department_id AS project_dept,
      p.created_by,
      u.department_id AS user_dept,
      u.position,
      (SELECT 1 FROM user_project_access upa
       WHERE upa.project_id = p.project_id AND upa.user_id = $2
         AND (upa.expires_at IS NULL OR upa.expires_at > now())
       LIMIT 1) AS has_user_grant,
      (SELECT 1 FROM project_department_access pda
       WHERE pda.project_id = p.project_id AND pda.department_id = u.department_id
         AND (pda.expires_at IS NULL OR pda.expires_at > now())
       LIMIT 1) AS has_dept_grant,
      (SELECT 1 FROM users creator
       JOIN departments d ON d.department_id = creator.department_id
       WHERE creator.user_id = p.created_by
         AND d.head_user_id = $2) AS is_head_of_creators_dept
    FROM projects p, users u
    WHERE p.project_id = $1 AND u.user_id = $2
  `, [projectId, user.userId]);

  if (r.rowCount === 0) return { exists: true, allowed: false };
  const row = r.rows[0];

  // Director
  if ((row.position || '').toLowerCase().includes('директор')) return { exists: true, allowed: true };
  // Public project
  if (row.confidentiality_level === 'public') return { exists: true, allowed: true };
  // Department project matching user's dept
  if (row.confidentiality_level === 'department' && row.project_dept === row.user_dept) {
    return { exists: true, allowed: true };
  }
  // Explicit user grant (not expired)
  if (row.has_user_grant) return { exists: true, allowed: true };
  // Department grant (not expired)
  if (row.has_dept_grant) return { exists: true, allowed: true };
  // Department head seeing projects by department members
  if (row.is_head_of_creators_dept) return { exists: true, allowed: true };

  return { exists: true, allowed: false };
}

// Middleware: require modify permission on :id project
function requireModify(req, res, next) {
  const projectId = Number(req.params.id);
  if (!Number.isInteger(projectId)) {
    return res.status(400).json({ error: 'Некорректный ID проекта' });
  }
  checkModifyPermission(pool, projectId, req.user)
    .then(({ exists, level }) => {
      if (!exists) return res.status(404).json({ error: 'Проект не найден' });
      if (!level) return res.status(403).json({ error: 'Недостаточно прав для изменения проекта' });
      req.projectPermission = level;
      next();
    })
    .catch(err => {
      console.error(err);
      res.status(500).json({ error: 'Ошибка сервера' });
    });
}

// Middleware: require view permission on :id project
function requireView(req, res, next) {
  const projectId = Number(req.params.id);
  if (!Number.isInteger(projectId)) {
    return res.status(400).json({ error: 'Некорректный ID проекта' });
  }
  checkViewPermission(pool, projectId, req.user)
    .then(({ exists, allowed }) => {
      if (!exists) return res.status(404).json({ error: 'Проект не найден' });
      if (!allowed) return res.status(403).json({ error: 'Нет доступа к проекту' });
      next();
    })
    .catch(err => {
      console.error(err);
      res.status(500).json({ error: 'Ошибка сервера' });
    });
}

// CREATE
router.post('/', auth, async (req, res) => {
  const {
    name,
    lead_id,
    start_date,
    due_date,
    status = 'active',
    description,
    confidentiality_level,
    department_id
  } = req.body;

  // SECURITY: created_by is always the current authenticated user.
  // Ignore any created_by in req.body to prevent impersonation.
  const createdBy = req.user.userId;
  const leadId = lead_id ? Number(lead_id) : null;
  const deptId = department_id ? Number(department_id) : null;
  const confLevel = confidentiality_level || 'public';
  const startDate = start_date || null;

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
    // NOTE: `status` is NOT NULL in the schema with DEFAULT 'active'. If the
    // frontend ever sends `null` explicitly (e.g. an empty Select bound to
    // null instead of undefined), PG treats that as "user chose NULL" and
    // rejects with a not-null violation instead of falling back to the
    // default. COALESCE to 'active' enum value is the same defense already
    // used for `start_date` above.
    const result = await pool.query(
      `
      INSERT INTO projects
        (name, created_by, lead_id, start_date, due_date, status, description,
         created_at, updated_at,
         confidentiality_level, department_id)
      VALUES
        ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5,
         COALESCE($6::project_status, 'active'::project_status), $7,
         now(), now(), $8, $9)
      RETURNING project_id
      `,
      [
        name.trim(),
        createdBy,
        leadId,
        startDate,
        due_date || null,
        status || null,
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

    // Everyone else: public + own department + explicit access (user or department)
    // Department heads additionally see ALL projects created by members of their department
    // (prevents subordinates from hiding confidential projects from their lead)
    // Expired grants are filtered out.
    const isDeptHead = me.is_department_head === true;

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
          WHERE upa.project_id = p.project_id
            AND upa.user_id = $2
            AND (upa.expires_at IS NULL OR upa.expires_at > now())
        )
        OR ($1::integer IS NOT NULL AND EXISTS (
          SELECT 1 FROM project_department_access pda
          WHERE pda.project_id = p.project_id
            AND pda.department_id = $1
            AND (pda.expires_at IS NULL OR pda.expires_at > now())
        ))
        OR (
          $3::boolean = true
          AND $1::integer IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM users creator
            WHERE creator.user_id = p.created_by
            AND creator.department_id = $1
          )
        )
      ORDER BY p.name
    `, [me.department_id, req.user.userId, isDeptHead]);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// UPDATE
router.put('/:id', auth, requireModify, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Некорректный ID' });
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
      start_date: start_date || current.rows[0].start_date,
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
router.delete('/:id', auth, requireModify, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Некорректный ID' });

  try {
    const dependencies = await collectDependencyConflicts(pool, [
      {
        key: 'tapes',
        label: 'ленты в этом проекте',
        query: `
          SELECT tape_id AS id, name
          FROM tapes
          WHERE project_id = $1
             OR EXISTS (
               SELECT 1
               FROM tape_projects tp
               WHERE tp.tape_id = tapes.tape_id
                 AND tp.project_id = $1
             )
          ORDER BY tape_id
          LIMIT 25
        `,
        params: [id]
      },
      {
        key: 'electrode_cut_batches',
        label: 'партии электродов в этом проекте',
        query: `
          SELECT ecb.cut_batch_id AS id, ecb.comments AS name
          FROM electrode_cut_batches ecb
          WHERE EXISTS (
            SELECT 1
            FROM electrode_cut_batch_projects ecbp
            WHERE ecbp.cut_batch_id = ecb.cut_batch_id
              AND ecbp.project_id = $1
          )
          ORDER BY ecb.cut_batch_id
          LIMIT 25
        `,
        params: [id]
      },
      {
        key: 'batteries',
        label: 'аккумуляторы в этом проекте',
        query: `
          SELECT battery_id AS id, battery_notes AS name
          FROM batteries
          WHERE project_id = $1
             OR EXISTS (
               SELECT 1
               FROM battery_projects bp
               WHERE bp.battery_id = batteries.battery_id
                 AND bp.project_id = $1
             )
          ORDER BY battery_id
          LIMIT 25
        `,
        params: [id]
      }
    ]);

    if (dependencies.length > 0) {
      return sendDependencyConflict(
        res,
        'Нельзя удалить проект: в нём есть ленты, партии электродов или аккумуляторы',
        dependencies
      );
    }

    const result = await pool.query(
      'DELETE FROM projects WHERE project_id = $1',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Проект не найден' });
    }

    res.status(204).end();
  } catch (err) {
    if (sendForeignKeyConflict(res, err, 'Нельзя удалить проект: он связан с другими записями')) {
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});



// -------- PROJECT ACCESS MANAGEMENT --------

// GET /api/projects/:id/access — list users with access to project
router.get('/:id/access', auth, requireView, async (req, res) => {
  const projectId = Number(req.params.id);
  if (!Number.isInteger(projectId)) return res.status(400).json({ error: 'Некорректный ID' });

  try {
    const result = await pool.query(`
      SELECT * FROM (
        SELECT 'user' AS grantee_type,
               u.user_id AS grantee_id,
               u.name AS grantee_name,
               u.position AS grantee_position,
               u.department_id,
               d.name AS department_name,
               upa.access_level,
               upa.granted_at,
               upa.expires_at,
               (upa.expires_at IS NOT NULL AND upa.expires_at <= now()) AS is_expired,
               g.name AS granted_by_name
        FROM user_project_access upa
        JOIN users u ON u.user_id = upa.user_id
        LEFT JOIN departments d ON d.department_id = u.department_id
        LEFT JOIN users g ON g.user_id = upa.granted_by
        WHERE upa.project_id = $1

        UNION ALL

        SELECT 'department' AS grantee_type,
               d.department_id AS grantee_id,
               d.name AS grantee_name,
               NULL::text AS grantee_position,
               d.department_id,
               d.name AS department_name,
               pda.access_level,
               pda.granted_at,
               pda.expires_at,
               (pda.expires_at IS NOT NULL AND pda.expires_at <= now()) AS is_expired,
               g.name AS granted_by_name
        FROM project_department_access pda
        JOIN departments d ON d.department_id = pda.department_id
        LEFT JOIN users g ON g.user_id = pda.granted_by
        WHERE pda.project_id = $1
      ) sub
      ORDER BY grantee_type, grantee_name
    `, [projectId]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── Helper: audit access changes into field_changelog ────────────────
// Swallows errors — audit failures must not break grant operations.
async function logAccessChanges(db, projectId, userId, action, payload) {
  try {
    await db.query(
      `INSERT INTO field_changelog
         (entity_type, entity_id, field_name, old_value, new_value, changed_by)
       VALUES ('project_access', $1, $2, NULL, $3, $4)`,
      [projectId, action, JSON.stringify(payload), userId]
    );
  } catch (err) {
    console.error('Failed to log access change:', err.message);
  }
}

// POST /api/projects/:id/access — grant access (users and/or departments)
// Accepts: { user_id, user_ids[], department_id, department_ids[], access_level, expires_at, expires_in_days }
// Legacy { user_id } payload still works (single element).
// Requires modify permission (admin | director | owner | project-admin).
router.post('/:id/access', auth, requireModify, async (req, res) => {
  const projectId = Number(req.params.id);
  if (!Number.isInteger(projectId)) return res.status(400).json({ error: 'Некорректный ID' });

  const {
    user_id, user_ids, department_id, department_ids,
    access_level = 'view',
    expires_at,
    expires_in_days,
  } = req.body;

  if (!['view', 'edit', 'admin'].includes(access_level)) {
    return res.status(400).json({ error: 'Некорректный уровень доступа' });
  }

  // Normalize targets
  const userIds = Array.isArray(user_ids)
    ? user_ids.map(Number).filter(Number.isInteger)
    : (user_id != null ? [Number(user_id)].filter(Number.isInteger) : []);
  const deptIds = Array.isArray(department_ids)
    ? department_ids.map(Number).filter(Number.isInteger)
    : (department_id != null ? [Number(department_id)].filter(Number.isInteger) : []);

  if (userIds.length === 0 && deptIds.length === 0) {
    return res.status(400).json({ error: 'Не указаны получатели доступа' });
  }

  // Compute expires_at
  let expAt = null;
  if (expires_at) {
    const d = new Date(expires_at);
    if (isNaN(d.getTime())) return res.status(400).json({ error: 'Некорректная дата истечения' });
    expAt = d.toISOString();
  } else if (Number.isFinite(Number(expires_in_days)) && Number(expires_in_days) > 0) {
    expAt = new Date(Date.now() + Number(expires_in_days) * 86400000).toISOString();
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const uid of userIds) {
      await client.query(
        `INSERT INTO user_project_access (user_id, project_id, granted_by, access_level, expires_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, project_id) DO UPDATE SET
           access_level = EXCLUDED.access_level,
           granted_by   = EXCLUDED.granted_by,
           granted_at   = now(),
           expires_at   = EXCLUDED.expires_at`,
        [uid, projectId, req.user.userId, access_level, expAt]
      );
    }

    for (const did of deptIds) {
      await client.query(
        `INSERT INTO project_department_access (project_id, department_id, granted_by, access_level, expires_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (project_id, department_id) DO UPDATE SET
           access_level = EXCLUDED.access_level,
           granted_by   = EXCLUDED.granted_by,
           granted_at   = now(),
           expires_at   = EXCLUDED.expires_at`,
        [projectId, did, req.user.userId, access_level, expAt]
      );
    }

    await logAccessChanges(client, projectId, req.user.userId, 'grant',
      { userIds, deptIds, access_level, expires_at: expAt });

    await client.query('COMMIT');
    res.json({
      success: true,
      granted_users: userIds.length,
      granted_departments: deptIds.length,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
});

// POST /api/projects/:id/access/copy — copy all active grants from another project
// Requires modify permission on target + view permission on source.
router.post('/:id/access/copy', auth, requireModify, async (req, res) => {
  const targetId = Number(req.params.id);
  const sourceId = Number(req.body?.source_project_id);
  const overwrite = req.body?.overwrite === true;

  if (!Number.isInteger(targetId) || !Number.isInteger(sourceId) || targetId === sourceId) {
    return res.status(400).json({ error: 'Некорректные идентификаторы' });
  }

  // Must also be able to VIEW the source project
  const sourceCheck = await checkViewPermission(pool, sourceId, req.user);
  if (!sourceCheck.exists) {
    return res.status(404).json({ error: 'Исходный проект не найден' });
  }
  if (!sourceCheck.allowed) {
    return res.status(403).json({ error: 'Нет доступа к исходному проекту' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const upaSql = overwrite
      ? `INSERT INTO user_project_access (user_id, project_id, granted_by, access_level, expires_at)
         SELECT upa.user_id, $1, $2, upa.access_level, upa.expires_at
         FROM user_project_access upa
         WHERE upa.project_id = $3
           AND (upa.expires_at IS NULL OR upa.expires_at > now())
         ON CONFLICT (user_id, project_id) DO UPDATE SET
           access_level = EXCLUDED.access_level,
           granted_by   = EXCLUDED.granted_by,
           granted_at   = now(),
           expires_at   = EXCLUDED.expires_at`
      : `INSERT INTO user_project_access (user_id, project_id, granted_by, access_level, expires_at)
         SELECT upa.user_id, $1, $2, upa.access_level, upa.expires_at
         FROM user_project_access upa
         WHERE upa.project_id = $3
           AND (upa.expires_at IS NULL OR upa.expires_at > now())
         ON CONFLICT (user_id, project_id) DO NOTHING`;
    const userRes = await client.query(upaSql, [targetId, req.user.userId, sourceId]);

    const pdaSql = overwrite
      ? `INSERT INTO project_department_access (project_id, department_id, granted_by, access_level, expires_at)
         SELECT $1, pda.department_id, $2, pda.access_level, pda.expires_at
         FROM project_department_access pda
         WHERE pda.project_id = $3
           AND (pda.expires_at IS NULL OR pda.expires_at > now())
         ON CONFLICT (project_id, department_id) DO UPDATE SET
           access_level = EXCLUDED.access_level,
           granted_by   = EXCLUDED.granted_by,
           granted_at   = now(),
           expires_at   = EXCLUDED.expires_at`
      : `INSERT INTO project_department_access (project_id, department_id, granted_by, access_level, expires_at)
         SELECT $1, pda.department_id, $2, pda.access_level, pda.expires_at
         FROM project_department_access pda
         WHERE pda.project_id = $3
           AND (pda.expires_at IS NULL OR pda.expires_at > now())
         ON CONFLICT (project_id, department_id) DO NOTHING`;
    const deptRes = await client.query(pdaSql, [targetId, req.user.userId, sourceId]);

    await logAccessChanges(client, targetId, req.user.userId, 'copy',
      { source_project_id: sourceId, copied_users: userRes.rowCount, copied_departments: deptRes.rowCount });

    await client.query('COMMIT');
    res.json({
      success: true,
      copied_users: userRes.rowCount,
      copied_departments: deptRes.rowCount,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
});

// GET /api/projects/:id/access/presets — computed presets for quick grant
// Requires modify permission (only people who can manage access see presets).
router.get('/:id/access/presets', auth, requireModify, async (req, res) => {
  const projectId = Number(req.params.id);
  if (!Number.isInteger(projectId)) return res.status(400).json({ error: 'Некорректный ID' });

  try {
    const meRow = await pool.query(
      'SELECT department_id FROM users WHERE user_id = $1',
      [req.user.userId]
    );
    const myDept = meRow.rows[0]?.department_id;

    const presets = [];

    // 1. Моя команда
    if (myDept) {
      const r = await pool.query(
        `SELECT user_id, name FROM users
         WHERE department_id = $1 AND active = true AND user_id <> $2
         ORDER BY name`,
        [myDept, req.user.userId]
      );
      presets.push({
        key: 'my_team',
        label: 'Моя команда',
        description: 'Все активные участники моего отдела',
        user_ids: r.rows.map(x => x.user_id),
        count: r.rowCount,
      });
    }

    // 2. Все руководители отделов
    const headsRes = await pool.query(
      `SELECT DISTINCT u.user_id, u.name
       FROM departments d
       JOIN users u ON u.user_id = d.head_user_id
       WHERE u.active = true
       ORDER BY u.name`
    );
    presets.push({
      key: 'department_heads',
      label: 'Руководители отделов',
      description: 'Действующие главы отделов',
      user_ids: headsRes.rows.map(x => x.user_id),
      count: headsRes.rowCount,
    });

    // 3. R&D (heuristic by position or department name)
    const rdRes = await pool.query(
      `SELECT u.user_id, u.name
       FROM users u
       LEFT JOIN departments d ON d.department_id = u.department_id
       WHERE u.active = true
         AND (
           lower(u.position) LIKE '%исследов%'
           OR lower(u.position) LIKE '%научн%'
           OR lower(d.name) LIKE '%r&d%'
           OR lower(d.name) LIKE '%ниокр%'
         )
       ORDER BY u.name`
    );
    presets.push({
      key: 'rd',
      label: 'R&D',
      description: 'Научные сотрудники и исследователи',
      user_ids: rdRes.rows.map(x => x.user_id),
      count: rdRes.rowCount,
    });

    res.json({ presets });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/projects/:id/access/user/:userId — revoke user access
router.delete('/:id/access/user/:userId', auth, requireModify, async (req, res) => {
  const projectId = Number(req.params.id);
  const userId = Number(req.params.userId);

  if (!Number.isInteger(projectId) || !Number.isInteger(userId)) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
    const r = await pool.query(
      'DELETE FROM user_project_access WHERE user_id = $1 AND project_id = $2',
      [userId, projectId]
    );
    if (r.rowCount > 0) {
      await logAccessChanges(pool, projectId, req.user.userId, 'revoke',
        { userIds: [userId], deptIds: [] });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/projects/:id/access/department/:deptId — revoke department access
router.delete('/:id/access/department/:deptId', auth, requireModify, async (req, res) => {
  const projectId = Number(req.params.id);
  const deptId = Number(req.params.deptId);

  if (!Number.isInteger(projectId) || !Number.isInteger(deptId)) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
    const r = await pool.query(
      'DELETE FROM project_department_access WHERE department_id = $1 AND project_id = $2',
      [deptId, projectId]
    );
    if (r.rowCount > 0) {
      await logAccessChanges(pool, projectId, req.user.userId, 'revoke',
        { userIds: [], deptIds: [deptId] });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/projects/:id/access/:userId — legacy shim
// Registered AFTER /access/user/:userId and /access/department/:deptId so those
// routes match first. Non-numeric :userId values are rejected explicitly so that
// paths like /access/user/5 (which already matched above) don't trip the legacy
// shim if ever reordered by mistake.
router.delete('/:id/access/:userId', auth, requireModify, async (req, res) => {
  const projectId = Number(req.params.id);
  const userId = Number(req.params.userId);

  if (!Number.isInteger(projectId) || !Number.isInteger(userId)) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
    const r = await pool.query(
      'DELETE FROM user_project_access WHERE user_id = $1 AND project_id = $2',
      [userId, projectId]
    );
    if (r.rowCount > 0) {
      await logAccessChanges(pool, projectId, req.user.userId, 'revoke',
        { userIds: [userId], deptIds: [] });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
