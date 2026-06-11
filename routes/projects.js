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

const VALID_CONFIDENTIALITY = ['public', 'confidential'];

function normalizeConfidentialityLevel(value) {
  if (value === 'secret') return 'confidential';
  if (value === 'department') return 'confidential';
  if (value === 'public') return 'public';
  if (value === 'confidential') return 'confidential';
  return null;
}

function normalizeOptionalInteger(value) {
  if (value === '' || value == null) return null;
  const num = Number(value);
  return Number.isInteger(num) ? num : null;
}

async function setProjectUserAccess(db, projectId, userId, accessLevel, changedBy) {
  if (!Number.isInteger(Number(userId))) return;

  await db.query(
    `INSERT INTO user_project_access (user_id, project_id, granted_by, access_level, expires_at)
     VALUES ($1, $2, $3, $4, NULL)
     ON CONFLICT (user_id, project_id) DO UPDATE SET
       access_level = EXCLUDED.access_level,
       granted_by   = EXCLUDED.granted_by,
       granted_at   = now(),
       expires_at   = NULL`,
    [Number(userId), projectId, changedBy, accessLevel]
  );
}

async function ensureParticipantViewAccess(db, projectId, userId, changedBy) {
  if (!Number.isInteger(Number(userId))) return;

  await db.query(
    `INSERT INTO user_project_access (user_id, project_id, granted_by, access_level, expires_at)
     VALUES ($1, $2, $3, 'view', NULL)
     ON CONFLICT (user_id, project_id) DO UPDATE SET
       access_level = CASE
         WHEN user_project_access.access_level IN ('edit', 'admin')
          AND (user_project_access.expires_at IS NULL OR user_project_access.expires_at > now())
           THEN user_project_access.access_level
         ELSE 'view'
       END,
       granted_by = EXCLUDED.granted_by,
       granted_at = now(),
       expires_at = NULL`,
    [Number(userId), projectId, changedBy]
  );
}

async function syncProjectLeadAccess(db, projectId, previousLeadId, nextLeadId, changedBy) {
  const previousLead = normalizeOptionalInteger(previousLeadId);
  const nextLead = normalizeOptionalInteger(nextLeadId);

  if (previousLead && previousLead !== nextLead) {
    await setProjectUserAccess(db, projectId, previousLead, 'view', changedBy);
    await logAccessChanges(db, projectId, changedBy, 'project_lead_demote', {
      userIds: [previousLead],
      access_level: 'view'
    });
  }

  if (nextLead) {
    await setProjectUserAccess(db, projectId, nextLead, 'admin', changedBy);
    await logAccessChanges(db, projectId, changedBy, 'project_lead_admin', {
      userIds: [nextLead],
      access_level: 'admin'
    });
  }
}

async function ensureProjectLeadParticipant(db, projectId, leadId, changedBy) {
  const normalizedLeadId = normalizeOptionalInteger(leadId);
  if (!normalizedLeadId) return;

  const displayOrder = await getNextParticipantDisplayOrder(db, projectId);

  await db.query(
    `
    INSERT INTO project_participants
      (project_id, user_id, display_order, role_in_team, notes, created_by, updated_by)
    VALUES
      ($1, $2, $3, 'Руководитель проекта', NULL, $4, $4)
    ON CONFLICT (project_id, user_id) DO NOTHING
    `,
    [projectId, normalizedLeadId, displayOrder, changedBy]
  );
}

async function clearPreviousProjectLeadParticipantRole(db, projectId, previousLeadId, nextLeadId) {
  const previousLead = normalizeOptionalInteger(previousLeadId);
  const nextLead = normalizeOptionalInteger(nextLeadId);

  if (!previousLead || previousLead === nextLead) return;

  await db.query(
    `
    UPDATE project_participants
    SET role_in_team = '',
        updated_at = now()
    WHERE project_id = $1
      AND user_id = $2
      AND role_in_team = 'Руководитель проекта'
    `,
    [projectId, previousLead]
  );
}

function normalizeParticipantText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalParticipantText(value) {
  const text = normalizeParticipantText(value);
  return text || null;
}

function normalizeDisplayOrder(value, fallback = 0) {
  if (value === '' || value == null) return fallback;
  const num = Number(value);
  return Number.isInteger(num) ? num : fallback;
}

async function validateActiveParticipantUser(db, userId) {
  if (!Number.isInteger(userId)) {
    const err = new Error('Некорректный пользователь');
    err.statusCode = 400;
    throw err;
  }

  const result = await db.query(
    'SELECT user_id FROM users WHERE user_id = $1 AND COALESCE(active, true) = true',
    [userId]
  );

  if (result.rowCount === 0) {
    const err = new Error('Пользователь не найден или неактивен');
    err.statusCode = 400;
    throw err;
  }
}

async function getNextParticipantDisplayOrder(db, projectId) {
  const result = await db.query(
    'SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM project_participants WHERE project_id = $1',
    [projectId]
  );

  return Number(result.rows[0]?.next_order || 1);
}

async function getProjectParticipantRow(db, projectId, participantId) {
  const result = await db.query(
    `
    SELECT
      pp.participant_id,
      pp.project_id,
      pp.user_id,
      u.name AS user_name,
      u.position AS user_position,
      u.department_id,
      d.name AS department_name,
      pp.display_order,
      pp.role_in_team,
      pp.notes,
      pp.created_by,
      pp.created_at,
      pp.updated_by,
      pp.updated_at,
      creator.name AS created_by_name,
      updater.name AS updated_by_name
    FROM project_participants pp
    JOIN users u
      ON u.user_id = pp.user_id
    LEFT JOIN departments d
      ON d.department_id = u.department_id
    LEFT JOIN users creator
      ON creator.user_id = pp.created_by
    LEFT JOIN users updater
      ON updater.user_id = pp.updated_by
    WHERE pp.project_id = $1
      AND pp.participant_id = $2
    `,
    [projectId, participantId]
  );

  return result.rows[0] || null;
}

async function getProjectParticipants(db, projectId) {
  const result = await db.query(
    `
    SELECT
      pp.participant_id,
      pp.project_id,
      pp.user_id,
      u.name AS user_name,
      u.position AS user_position,
      u.department_id,
      d.name AS department_name,
      pp.display_order,
      pp.role_in_team,
      pp.notes,
      pp.created_by,
      pp.created_at,
      pp.updated_by,
      pp.updated_at,
      creator.name AS created_by_name,
      updater.name AS updated_by_name
    FROM project_participants pp
    JOIN users u
      ON u.user_id = pp.user_id
    LEFT JOIN departments d
      ON d.department_id = u.department_id
    LEFT JOIN users creator
      ON creator.user_id = pp.created_by
    LEFT JOIN users updater
      ON updater.user_id = pp.updated_by
    WHERE pp.project_id = $1
    ORDER BY pp.display_order, pp.participant_id
    `,
    [projectId]
  );

  return result.rows;
}

// ── Authorization helpers ─────────────────────────────────────────────
// Determines who can MODIFY a project.
// With allowEdit=false, requires project-admin/manage access.
// With allowEdit=true, explicit edit access may modify ordinary project fields.
// Returns: { exists: boolean, level: 'admin'|'director'|'owner'|'project-lead'|'project-admin'|'project-edit'|null }
async function checkModifyPermission(db, projectId, user, options = {}) {
  // First verify the project exists (needed even for admins so we return 404 not 500)
  const projCheck = await db.query('SELECT created_by, lead_id FROM projects WHERE project_id = $1', [projectId]);
  if (projCheck.rowCount === 0) {
    return { exists: false, level: null };
  }
  const projCreatedBy = projCheck.rows[0].created_by;
  const projLeadId = projCheck.rows[0].lead_id;

  // Admins can always modify (but only existing projects)
  if (user.role === 'admin') return { exists: true, level: 'admin' };
  // Project lead has project-admin privileges
  if (Number(projLeadId) === Number(user.userId)) return { exists: true, level: 'project-lead' };

  // Fetch user context + explicit access level
  const r = await db.query(`
    SELECT u.position AS user_position,
           (SELECT access_level FROM user_project_access
            WHERE project_id = $1 AND user_id = $2
              AND (expires_at IS NULL OR expires_at > now())) AS explicit_level
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
  // User with 'edit' access can edit ordinary project fields, but cannot manage access.
  if (options.allowEdit && row.explicit_level === 'edit') {
    return { exists: true, level: 'project-edit' };
  }

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
      p.created_by,
      p.lead_id,
      u.position,
      (SELECT 1 FROM user_project_access upa
       WHERE upa.project_id = p.project_id AND upa.user_id = $2
         AND (upa.expires_at IS NULL OR upa.expires_at > now())
       LIMIT 1) AS has_user_grant,
      (SELECT 1 FROM project_participants pp
       WHERE pp.project_id = p.project_id AND pp.user_id = $2
       LIMIT 1) AS has_participant_access,
      (p.created_by = $2) AS is_creator
    FROM projects p, users u
    WHERE p.project_id = $1 AND u.user_id = $2
  `, [projectId, user.userId]);

  if (r.rowCount === 0) return { exists: true, allowed: false };
  const row = r.rows[0];

  // Director
  if ((row.position || '').toLowerCase().includes('директор')) return { exists: true, allowed: true };
  // Project lead has project-admin privileges
  if (Number(row.lead_id) === Number(user.userId)) return { exists: true, allowed: true };
  // Project creator can view the project they created.
  if (row.is_creator) return { exists: true, allowed: true };
  // Public project
  if (row.confidentiality_level === 'public') return { exists: true, allowed: true };
  // Explicit user grant (not expired)
  if (row.has_user_grant) return { exists: true, allowed: true };
  // Project participant
  if (row.has_participant_access) return { exists: true, allowed: true };

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

function requireEdit(req, res, next) {
  const projectId = Number(req.params.id);
  if (!Number.isInteger(projectId)) {
    return res.status(400).json({ error: 'Некорректный ID проекта' });
  }
  checkModifyPermission(pool, projectId, req.user, { allowEdit: true })
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

async function getProjectReport(db, projectId) {
  const [
    projectResult,
    participantsResult,
    departmentAccessResult,
    userAccessResult,
    effectiveUsersResult,
    tapeResult,
    electrodeBatchResult,
    batteryResult
  ] = await Promise.all([
    db.query(`
      SELECT p.project_id, p.name, p.created_by, p.lead_id,
             lead.name AS lead_name,
             p.start_date, p.due_date, p.status, p.description,
             p.confidentiality_level, p.department_id,
             d.name AS department_name,
             p.created_at, p.updated_at, p.updated_by,
             creator.name AS created_by_name,
             updater.name AS updated_by_name
      FROM projects p
      LEFT JOIN users lead ON lead.user_id = p.lead_id
      LEFT JOIN departments d ON d.department_id = p.department_id
      LEFT JOIN users creator ON creator.user_id = p.created_by
      LEFT JOIN users updater ON updater.user_id = p.updated_by
      WHERE p.project_id = $1
    `, [projectId]),
    getProjectParticipants(db, projectId),
    db.query(`
      SELECT pda.department_id, d.name AS department_name,
             pda.access_level, pda.granted_at, pda.expires_at,
             (pda.expires_at IS NOT NULL AND pda.expires_at <= now()) AS is_expired,
             g.name AS granted_by_name
      FROM project_department_access pda
      JOIN departments d ON d.department_id = pda.department_id
      LEFT JOIN users g ON g.user_id = pda.granted_by
      WHERE pda.project_id = $1
      ORDER BY d.name
    `, [projectId]),
    db.query(`
      SELECT upa.user_id, u.name AS user_name,
             u.department_id, d.name AS department_name,
             upa.access_level, upa.granted_at, upa.expires_at,
             (upa.expires_at IS NOT NULL AND upa.expires_at <= now()) AS is_expired,
             g.name AS granted_by_name
      FROM user_project_access upa
      JOIN users u ON u.user_id = upa.user_id
      LEFT JOIN departments d ON d.department_id = u.department_id
      LEFT JOIN users g ON g.user_id = upa.granted_by
      WHERE upa.project_id = $1
      ORDER BY u.name
    `, [projectId]),
    db.query(`
      WITH project_row AS (
        SELECT project_id, lead_id, confidentiality_level, department_id
        FROM projects
        WHERE project_id = $1
      ),
      access_sources AS (
        SELECT u.user_id,
               u.name AS user_name,
               u.position,
               u.department_id,
               d.name AS department_name,
               3 AS level_rank,
               'руководитель проекта' AS source_label
        FROM project_row p
        JOIN users u
          ON u.user_id = p.lead_id
        LEFT JOIN departments d
          ON d.department_id = u.department_id

        UNION ALL

        SELECT u.user_id,
               u.name AS user_name,
               u.position,
               u.department_id,
               d.name AS department_name,
               1 AS level_rank,
               'участник проекта' AS source_label
        FROM project_participants pp
        JOIN users u
          ON u.user_id = pp.user_id
        LEFT JOIN departments d
          ON d.department_id = u.department_id
        WHERE pp.project_id = $1
          AND COALESCE(u.active, true) = true

        UNION ALL

        SELECT u.user_id,
               u.name AS user_name,
               u.position,
               u.department_id,
               d.name AS department_name,
               1 AS level_rank,
               'открытый проект' AS source_label
        FROM project_row p
        JOIN users u
          ON COALESCE(u.active, true) = true
        LEFT JOIN departments d
          ON d.department_id = u.department_id
        WHERE p.confidentiality_level = 'public'

        UNION ALL

        SELECT u.user_id,
               u.name AS user_name,
               u.position,
               u.department_id,
               d.name AS department_name,
               CASE upa.access_level
                 WHEN 'admin' THEN 3
                 WHEN 'edit' THEN 2
                 ELSE 1
               END AS level_rank,
               'личный доступ' AS source_label
        FROM user_project_access upa
        JOIN users u
          ON u.user_id = upa.user_id
        LEFT JOIN departments d
          ON d.department_id = u.department_id
        WHERE upa.project_id = $1
          AND (upa.expires_at IS NULL OR upa.expires_at > now())
          AND COALESCE(u.active, true) = true
      )
      SELECT user_id,
             user_name,
             position,
             department_id,
             department_name,
             CASE MAX(level_rank)
               WHEN 3 THEN 'admin'
               WHEN 2 THEN 'edit'
               ELSE 'view'
             END AS access_level,
             string_agg(DISTINCT source_label, ', ' ORDER BY source_label) AS access_sources
      FROM access_sources
      GROUP BY user_id, user_name, position, department_id, department_name
      ORDER BY department_name NULLS LAST, user_name
    `, [projectId]),
    db.query(`
      SELECT DISTINCT
             t.tape_id,
             t.name,
             t.status,
             t.availability_status,
             COALESCE(t.item_created_at::timestamp, t.created_at) AS created_at,
             t.updated_at,
             r.role AS tape_role,
             r.name AS recipe_name,
             u_created.name AS created_by_name
      FROM tapes t
      LEFT JOIN tape_projects tp
        ON tp.tape_id = t.tape_id
      LEFT JOIN tape_recipes r
        ON r.tape_recipe_id = t.tape_recipe_id
      LEFT JOIN users u_created
        ON u_created.user_id = t.created_by
      WHERE t.project_id = $1
         OR tp.project_id = $1
      ORDER BY t.tape_id
    `, [projectId]),
    db.query(`
      SELECT DISTINCT
             ecb.cut_batch_id,
             ecb.tape_id,
             t.name AS tape_name,
             r.role AS tape_role,
             ecb.target_form_factor,
             ecb.target_config_code,
             ecb.shape,
             ecb.diameter_mm,
             ecb.length_mm,
             ecb.width_mm,
             ecb.comments,
             COALESCE(ecb.item_created_at::timestamp, ecb.created_at) AS created_at,
             u_created.name AS created_by_name,
             COALESCE(ec.electrode_count, 0)::int AS electrode_count,
             (
               SELECT c.coating_sidedness
               FROM tape_process_steps ts_coating
               JOIN operation_types ot_coating
                 ON ot_coating.operation_type_id = ts_coating.operation_type_id
               JOIN tape_step_coating c
                 ON c.step_id = ts_coating.step_id
               WHERE ts_coating.tape_id = ecb.tape_id
                 AND ot_coating.code = 'coating'
               LIMIT 1
             ) AS tape_coating_sidedness
      FROM electrode_cut_batches ecb
      JOIN tapes t
        ON t.tape_id = ecb.tape_id
      LEFT JOIN electrode_cut_batch_projects ecbp
        ON ecbp.cut_batch_id = ecb.cut_batch_id
      LEFT JOIN tape_recipes r
        ON r.tape_recipe_id = t.tape_recipe_id
      LEFT JOIN users u_created
        ON u_created.user_id = ecb.created_by
      LEFT JOIN (
        SELECT cut_batch_id, COUNT(*) AS electrode_count
        FROM electrodes
        GROUP BY cut_batch_id
      ) ec
        ON ec.cut_batch_id = ecb.cut_batch_id
      WHERE ecbp.project_id = $1
         OR t.project_id = $1
      ORDER BY ecb.cut_batch_id
    `, [projectId]),
    db.query(`
      SELECT DISTINCT
             b.battery_id,
             b.project_id,
             b.form_factor,
             b.status,
             b.battery_notes AS notes,
             COALESCE(b.item_created_at::timestamp, b.created_at) AS created_at,
             b.updated_at,
             u_created.name AS created_by_name
      FROM batteries b
      LEFT JOIN battery_projects bp
        ON bp.battery_id = b.battery_id
      LEFT JOIN users u_created
        ON u_created.user_id = b.created_by
      WHERE b.project_id = $1
         OR bp.project_id = $1
      ORDER BY b.battery_id
    `, [projectId])
  ]);

  if (projectResult.rowCount === 0) {
    const err = new Error('Проект не найден');
    err.statusCode = 404;
    throw err;
  }

  return {
    project: projectResult.rows[0],
    participants: participantsResult,
    access: {
      departments: departmentAccessResult.rows,
      users: userAccessResult.rows,
      effective_users: effectiveUsersResult.rows
    },
    downstream: {
      tapes: tapeResult.rows,
      electrode_batches: electrodeBatchResult.rows,
      batteries: batteryResult.rows
    },
    downstream_counts: {
      tapes: tapeResult.rows.length,
      electrode_batches: electrodeBatchResult.rows.length,
      batteries: batteryResult.rows.length
    }
  };
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
    confidentiality_level
  } = req.body;

  // SECURITY: created_by is always the current authenticated user.
  // Ignore any created_by in req.body to prevent impersonation.
  const createdBy = req.user.userId;
  const leadId = lead_id ? Number(lead_id) : null;
  const confLevel = normalizeConfidentialityLevel(confidentiality_level || 'public');
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

  // 4. validate confidentiality level
  if (!confLevel || !VALID_CONFIDENTIALITY.includes(confLevel)) {
    return res.status(400).json({ error: 'Некорректный уровень доступа' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // NOTE: `status` is NOT NULL in the schema with DEFAULT 'active'. If the
    // frontend ever sends `null` explicitly (e.g. an empty Select bound to
    // null instead of undefined), PG treats that as "user chose NULL" and
    // rejects with a not-null violation instead of falling back to the
    // default. COALESCE to 'active' enum value is the same defense already
    // used for `start_date` above.
    const result = await client.query(
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
        null
      ]
    );

    await syncProjectLeadAccess(client, result.rows[0].project_id, null, leadId, req.user.userId);
    await ensureProjectLeadParticipant(client, result.rows[0].project_id, leadId, req.user.userId);

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
});

// READ — filtered by user access + confidentiality
router.get('/', auth, async (req, res) => {
  try {
    // Get user context
    const userRow = await pool.query(
      `SELECT u.department_id, u.role, u.position
       FROM users u
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
               p.created_at,
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

    // Everyone else: public projects + owned/led projects + participant membership
    // + active explicit user access. Limited/confidential projects are invisible
    // unless one of those project-specific relationships exists.

    const result = await pool.query(`
      SELECT DISTINCT p.project_id, p.name, p.created_by, p.lead_id,
             u.name AS lead_name, p.start_date, p.due_date,
             p.status, p.description, p.confidentiality_level, p.department_id,
             d.name AS department_name,
             u_created.name AS created_by_name,
             p.created_at,
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
        OR p.lead_id = $1
        OR p.created_by = $1
        OR EXISTS (
          SELECT 1 FROM user_project_access upa
          WHERE upa.project_id = p.project_id
            AND upa.user_id = $1
            AND (upa.expires_at IS NULL OR upa.expires_at > now())
        )
        OR EXISTS (
          SELECT 1 FROM project_participants pp
          WHERE pp.project_id = p.project_id
            AND pp.user_id = $1
        )
      ORDER BY p.name
    `, [req.user.userId]);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/:id/report', auth, requireView, async (req, res) => {
  const projectId = Number(req.params.id);

  if (!Number.isInteger(projectId)) {
    return res.status(400).json({ error: 'Некорректный ID проекта' });
  }

  try {
    res.json(await getProjectReport(pool, projectId));
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }

    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки печатного отчёта по проекту' });
  }
});

// -------- PROJECT PARTICIPANTS --------

router.get('/:id/participants', auth, requireView, async (req, res) => {
  const projectId = Number(req.params.id);

  if (!Number.isInteger(projectId)) {
    return res.status(400).json({ error: 'Некорректный ID проекта' });
  }

  try {
    res.json(await getProjectParticipants(pool, projectId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки участников проекта' });
  }
});

router.post('/:id/participants', auth, requireModify, async (req, res) => {
  const projectId = Number(req.params.id);
  const userId = Number(req.body?.user_id);

  if (!Number.isInteger(projectId)) {
    return res.status(400).json({ error: 'Некорректный ID проекта' });
  }

  const roleInTeam = normalizeParticipantText(req.body?.role_in_team);
  const notes = normalizeOptionalParticipantText(req.body?.notes);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await validateActiveParticipantUser(client, userId);

    const displayOrder = normalizeDisplayOrder(
      req.body?.display_order,
      await getNextParticipantDisplayOrder(client, projectId)
    );

    const result = await client.query(
      `
      INSERT INTO project_participants
        (project_id, user_id, display_order, role_in_team, notes, created_by, updated_by)
      VALUES
        ($1, $2, $3, $4, $5, $6, $6)
      RETURNING participant_id
      `,
      [projectId, userId, displayOrder, roleInTeam, notes, req.user.userId]
    );

    await ensureParticipantViewAccess(client, projectId, userId, req.user.userId);

    const participant = await getProjectParticipantRow(client, projectId, result.rows[0].participant_id);

    await client.query('COMMIT');
    res.status(201).json(participant);
  } catch (err) {
    await client.query('ROLLBACK');

    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }

    if (err.code === '23505') {
      return res.status(409).json({ error: 'Пользователь уже добавлен в участники проекта' });
    }

    console.error(err);
    res.status(500).json({ error: 'Ошибка добавления участника проекта' });
  } finally {
    client.release();
  }
});

router.put('/:id/participants/:participantId', auth, requireModify, async (req, res) => {
  const projectId = Number(req.params.id);
  const participantId = Number(req.params.participantId);

  if (!Number.isInteger(projectId) || !Number.isInteger(participantId)) {
    return res.status(400).json({ error: 'Некорректный ID участника проекта' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const current = await client.query(
      'SELECT participant_id, project_id, user_id, display_order, role_in_team, notes FROM project_participants WHERE project_id = $1 AND participant_id = $2',
      [projectId, participantId]
    );

    if (current.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Участник проекта не найден' });
    }

    const oldValues = current.rows[0];
    const newVals = {
      display_order: normalizeDisplayOrder(req.body?.display_order, oldValues.display_order),
      role_in_team: Object.prototype.hasOwnProperty.call(req.body || {}, 'role_in_team')
        ? normalizeParticipantText(req.body.role_in_team)
        : oldValues.role_in_team,
      notes: Object.prototype.hasOwnProperty.call(req.body || {}, 'notes')
        ? normalizeOptionalParticipantText(req.body.notes)
        : oldValues.notes
    };

    const result = await client.query(
      `
      UPDATE project_participants
      SET display_order = $1,
          role_in_team = $2,
          notes = $3,
          updated_by = $4,
          updated_at = now()
      WHERE project_id = $5
        AND participant_id = $6
      RETURNING participant_id
      `,
      [
        newVals.display_order,
        newVals.role_in_team,
        newVals.notes,
        req.user.userId,
        projectId,
        participantId
      ]
    );

    await trackChanges(
      client,
      'project_participant',
      'project_participants',
      'participant_id',
      participantId,
      oldValues,
      newVals,
      req.user.userId,
      ['display_order', 'role_in_team', 'notes'],
      false
    );

    const participant = await getProjectParticipantRow(client, projectId, result.rows[0].participant_id);

    await client.query('COMMIT');
    res.json(participant);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления участника проекта' });
  } finally {
    client.release();
  }
});

router.delete('/:id/participants/:participantId', auth, requireModify, async (req, res) => {
  const projectId = Number(req.params.id);
  const participantId = Number(req.params.participantId);

  if (!Number.isInteger(projectId) || !Number.isInteger(participantId)) {
    return res.status(400).json({ error: 'Некорректный ID участника проекта' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const current = await client.query(
      `
      SELECT pp.user_id, pp.role_in_team, p.lead_id
      FROM project_participants pp
      JOIN projects p ON p.project_id = pp.project_id
      WHERE pp.project_id = $1
        AND pp.participant_id = $2
      `,
      [projectId, participantId]
    );

    if (current.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Участник проекта не найден' });
    }

    if (Number(current.rows[0].user_id) === Number(current.rows[0].lead_id)) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Руководителя нельзя убрать из команды; сначала измените руководителя проекта'
      });
    }

    await client.query(
      'DELETE FROM project_participants WHERE project_id = $1 AND participant_id = $2',
      [projectId, participantId]
    );

    await client.query(
      `DELETE FROM user_project_access
       WHERE project_id = $1
         AND user_id = $2`,
      [projectId, current.rows[0].user_id]
    );

    await logAccessChanges(client, projectId, req.user.userId, 'participant_remove', {
      participant_id: participantId,
      user_id: current.rows[0].user_id,
      role_in_team: current.rows[0].role_in_team
    });

    await client.query('COMMIT');
    res.status(204).end();
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Ошибка удаления участника проекта' });
  } finally {
    client.release();
  }
});

// UPDATE
router.put('/:id', auth, requireEdit, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Некорректный ID' });
  const {
    name,
    lead_id,
    start_date,
    due_date,
    status,
    description,
    confidentiality_level
  } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Название проекта обязательно' });
  }

  const requestedConfLevel = confidentiality_level !== undefined
    ? normalizeConfidentialityLevel(confidentiality_level)
    : undefined;
  if (confidentiality_level !== undefined && !requestedConfLevel) {
    return res.status(400).json({ error: 'Некорректный уровень доступа' });
  }

  const normalizedLeadId = normalizeOptionalInteger(lead_id);
  if (lead_id !== undefined && lead_id !== '' && lead_id !== null && normalizedLeadId === null) {
    return res.status(400).json({ error: 'Некорректный руководитель' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const current = await client.query(
      'SELECT name, lead_id, start_date, due_date, status, description, confidentiality_level, department_id FROM projects WHERE project_id = $1',
      [id]
    );
    if (current.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Проект не найден' });
    }

    const finalConfLevel = requestedConfLevel !== undefined
      ? requestedConfLevel
      : normalizeConfidentialityLevel(current.rows[0].confidentiality_level) || 'confidential';

    if (req.projectPermission === 'project-edit') {
      const leadChanged = Number(current.rows[0].lead_id || 0) !== Number(normalizedLeadId || 0);
      const visibilityChanged = finalConfLevel !== (
        normalizeConfidentialityLevel(current.rows[0].confidentiality_level) || 'confidential'
      );

      if (leadChanged || visibilityChanged) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          error: 'Редактор проекта не может менять руководителя или тип доступа'
        });
      }
    }

    const newVals = {
      name: name.trim(),
      lead_id: normalizedLeadId,
      start_date: start_date || current.rows[0].start_date,
      due_date: due_date || null,
      status: status || 'active',
      description: description || null,
      confidentiality_level: finalConfLevel,
      department_id: null,
    };

    const result = await client.query(
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
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Проект не найден' });
    }

    await syncProjectLeadAccess(client, id, current.rows[0].lead_id, newVals.lead_id, req.user.userId);
    await clearPreviousProjectLeadParticipantRole(client, id, current.rows[0].lead_id, newVals.lead_id);
    await ensureProjectLeadParticipant(client, id, newVals.lead_id, req.user.userId);
    await trackChanges(client, 'project', 'projects', 'project_id', Number(id), current.rows[0], newVals, req.user.userId);

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  } finally {
    client.release();
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

// GET /api/projects/:id/access — list project access sources/grants
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

        SELECT 'participant' AS grantee_type,
               u.user_id AS grantee_id,
               u.name AS grantee_name,
               u.position AS grantee_position,
               u.department_id,
               d.name AS department_name,
               'view'::text AS access_level,
               pp.created_at AS granted_at,
               NULL::timestamptz AS expires_at,
               false AS is_expired,
               creator.name AS granted_by_name
        FROM project_participants pp
        JOIN users u ON u.user_id = pp.user_id
        LEFT JOIN departments d ON d.department_id = u.department_id
        LEFT JOIN users creator ON creator.user_id = pp.created_by
        WHERE pp.project_id = $1

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

// POST /api/projects/:id/access — grant explicit user access from the current UI.
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

  // Normalize targets. User grants are current; department grants are kept only
  // for compatibility with legacy data/tooling.
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
