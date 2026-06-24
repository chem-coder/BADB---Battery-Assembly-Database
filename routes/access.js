const express = require('express');
const router = express.Router();
const pool = require('../db');
const { auth, requireRole } = require('../middleware/auth');

// All admin-facing endpoints require admin or lead role.
// Personal endpoint (/my) is available to any authenticated user.

// ─────────────────────────────────────────────────────────────────────
// GET /api/access/matrix — snapshot of all access data for the matrix view
// Returns raw data (users, projects, grants, participants) so the client can compute
// effective access per cell without extra round-trips.
// ─────────────────────────────────────────────────────────────────────
router.get('/matrix', auth, requireRole('admin', 'lead'), async (req, res) => {
  try {
    // Project-based access model: departments confer no access. The matrix
    // computes effective access per cell from project lead/creator, explicit
    // user grants, participants, and public visibility (see GET /api/access/my).
    const [users, projects, userGrants, participants] = await Promise.all([
      pool.query(`
        SELECT u.user_id, u.name, u.login, u.role, u.position, u.active
        FROM users u
        WHERE u.active = true
        ORDER BY u.name
      `),
      pool.query(`
        SELECT p.project_id, p.name, p.confidentiality_level,
               p.lead_id, p.created_by, u.name AS created_by_name,
               p.status
        FROM projects p
        LEFT JOIN users u ON u.user_id = p.created_by
        ORDER BY p.name
      `),
      pool.query(`
        SELECT upa.user_id, upa.project_id, upa.access_level,
               upa.granted_at, upa.expires_at,
               (upa.expires_at IS NOT NULL AND upa.expires_at <= now()) AS is_expired
        FROM user_project_access upa
      `),
      pool.query(`
        SELECT pp.user_id, pp.project_id, pp.participant_id,
               pp.role_in_team, pp.display_order, pp.created_at
        FROM project_participants pp
      `),
    ]);

    res.json({
      users: users.rows,
      projects: projects.rows,
      user_grants: userGrants.rows,
      participants: participants.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// GET /api/access/graph — raw rows for the membership constellation.
// Returns the data the client's buildAccessGraph() (utils/accessGraphModel.js)
// turns into nodes + edges, mirroring the /matrix raw-rows pattern so the
// graph logic stays unit-tested on the client. Project-based membership model:
// no departments. Edges are derived client-side from:
//   - participants        → member (CRUD the data)
//   - lead / owner / admin → manager (runs the project)
// Blanket access (public visibility, admin role, director) is not represented —
// it connects to everyone/everything and would saturate the map.
// ─────────────────────────────────────────────────────────────────────
router.get('/graph', auth, requireRole('admin', 'lead'), async (req, res) => {
  try {
    const [users, projects, participants, adminGrants] = await Promise.all([
      pool.query(`SELECT user_id, name FROM users WHERE active = true ORDER BY name`),
      pool.query(`
        SELECT project_id, name, confidentiality_level, lead_id, created_by
        FROM projects
        ORDER BY name
      `),
      pool.query(`SELECT user_id, project_id FROM project_participants`),
      pool.query(`
        SELECT user_id, project_id
        FROM user_project_access
        WHERE access_level = 'admin'
          AND (expires_at IS NULL OR expires_at > now())
      `),
    ]);

    res.json({
      users: users.rows,
      projects: projects.rows,
      participants: participants.rows,
      adminGrants: adminGrants.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// GET /api/access/timeline — audit log of access changes
// Pulls from field_changelog where entity_type = 'project_access'
// ─────────────────────────────────────────────────────────────────────
router.get('/timeline', auth, requireRole('admin', 'lead'), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;

    const result = await pool.query(`
      SELECT fc.id, fc.entity_id AS project_id,
             p.name AS project_name,
             fc.field_name AS action,
             fc.new_value AS payload,
             fc.changed_at,
             fc.changed_by,
             u.name AS changed_by_name
      FROM field_changelog fc
      LEFT JOIN projects p ON p.project_id = fc.entity_id
      LEFT JOIN users u ON u.user_id = fc.changed_by
      WHERE fc.entity_type = 'project_access'
      ORDER BY fc.changed_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    // Parse JSON payloads and enrich with names where possible
    const rows = result.rows.map(r => {
      let payload = null;
      try { payload = JSON.parse(r.payload); } catch { payload = { raw: r.payload }; }
      return { ...r, payload };
    });

    // Enrich user names in payloads (batch query). Project-based model: the
    // timeline does not surface departments, so legacy `deptIds` are ignored.
    const userIds = new Set();
    for (const r of rows) {
      if (r.payload?.userIds) r.payload.userIds.forEach(id => userIds.add(id));
    }

    const usersLookup = userIds.size
      ? await pool.query(`SELECT user_id, name FROM users WHERE user_id = ANY($1::int[])`, [[...userIds]])
      : { rows: [] };

    const userNames = Object.fromEntries(usersLookup.rows.map(r => [r.user_id, r.name]));

    for (const r of rows) {
      if (r.payload?.userIds) {
        r.payload.user_names = r.payload.userIds.map(id => userNames[id] || `#${id}`);
      }
    }

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// GET /api/access/my — current user's access summary (personal view)
// Returns projects grouped by access source + expiring grants.
// Available to any authenticated user.
// ─────────────────────────────────────────────────────────────────────
router.get('/my', auth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const meRow = await pool.query(
      `SELECT department_id, position FROM users WHERE user_id = $1`,
      [userId]
    );
    const me = meRow.rows[0] || {};
    const isDirector = (me.position || '').toLowerCase().includes('директор');

    // Projects visible to this user, with source of access
    const result = await pool.query(`
      SELECT DISTINCT ON (p.project_id)
        p.project_id, p.name, p.confidentiality_level,
        p.department_id AS project_dept,
        d.name AS project_dept_name,
	        p.created_at, p.status,
	        CASE
	          WHEN p.lead_id = $1 THEN 'project_lead'
	          WHEN p.created_by = $1 THEN 'project_owner'
	          WHEN p.confidentiality_level = 'public' THEN 'public'
	          WHEN EXISTS (
	            SELECT 1 FROM user_project_access upa
            WHERE upa.project_id = p.project_id AND upa.user_id = $1
              AND (upa.expires_at IS NULL OR upa.expires_at > now())
          ) THEN 'direct_grant'
          WHEN EXISTS (
	            SELECT 1 FROM project_participants pp
	            WHERE pp.project_id = p.project_id AND pp.user_id = $1
	          ) THEN 'project_participant'
	          ELSE 'none'
	        END AS access_source,
        (
          SELECT access_level FROM user_project_access
          WHERE project_id = p.project_id AND user_id = $1
            AND (expires_at IS NULL OR expires_at > now())
        ) AS direct_level,
        (
          SELECT expires_at FROM user_project_access
          WHERE project_id = p.project_id AND user_id = $1
            AND (expires_at IS NULL OR expires_at > now())
        ) AS direct_expires_at
      FROM projects p
      LEFT JOIN departments d ON d.department_id = p.department_id
	      WHERE (
	        p.confidentiality_level = 'public'
	        OR p.lead_id = $1
	        OR p.created_by = $1
	        OR EXISTS (
          SELECT 1 FROM user_project_access upa
          WHERE upa.project_id = p.project_id AND upa.user_id = $1
            AND (upa.expires_at IS NULL OR upa.expires_at > now())
        )
	        OR EXISTS (
	          SELECT 1 FROM project_participants pp
	          WHERE pp.project_id = p.project_id AND pp.user_id = $1
	        )
	        OR $2::boolean = true  -- director sees all
	      )
	      ORDER BY p.project_id, p.name
	    `, [userId, isDirector]);

    // Group by access source
    const grouped = {
	      public: [],
	      project_lead: [],
	      project_owner: [],
	      direct_grant: [],
	      project_participant: [],
	      none: [],
    };
    for (const row of result.rows) {
      const src = row.access_source || 'none';
      if (grouped[src]) grouped[src].push(row);
    }

    // Find expiring grants (next 7 days) where user is the grantee
    const expiring = await pool.query(`
      SELECT upa.project_id, p.name AS project_name,
             upa.access_level, upa.expires_at,
             extract(epoch FROM (upa.expires_at - now())) / 86400 AS days_remaining
      FROM user_project_access upa
      JOIN projects p ON p.project_id = upa.project_id
      WHERE upa.user_id = $1
        AND upa.expires_at IS NOT NULL
        AND upa.expires_at > now()
        AND upa.expires_at < now() + interval '7 days'
      ORDER BY upa.expires_at
    `, [userId]);

    res.json({
      grouped,
      expiring: expiring.rows,
      is_director: isDirector,
      department_id: me.department_id,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
