const express = require('express');
const router = express.Router();
const pool = require('../db');
const { auth, requireRole } = require('../middleware/auth');

// All admin-facing endpoints require admin or lead role.
// Personal endpoint (/my) is available to any authenticated user.

// ─────────────────────────────────────────────────────────────────────
// GET /api/access/matrix — snapshot of all access data for the matrix view
// Returns raw data (users, projects, grants) so the client can compute
// effective access per cell without extra round-trips.
// ─────────────────────────────────────────────────────────────────────
router.get('/matrix', auth, requireRole('admin', 'lead'), async (req, res) => {
  try {
    const [users, projects, userGrants, deptGrants, departments] = await Promise.all([
      pool.query(`
        SELECT u.user_id, u.name, u.login, u.role, u.position,
               u.department_id, d.name AS department_name, u.active
        FROM users u
        LEFT JOIN departments d ON d.department_id = u.department_id
        WHERE u.active = true
        ORDER BY d.name NULLS LAST, u.name
      `),
      pool.query(`
        SELECT p.project_id, p.name, p.confidentiality_level,
               p.department_id, d.name AS project_dept_name,
               p.created_by, u.name AS created_by_name,
               p.status
        FROM projects p
        LEFT JOIN departments d ON d.department_id = p.department_id
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
        SELECT pda.department_id, pda.project_id, pda.access_level,
               pda.granted_at, pda.expires_at,
               (pda.expires_at IS NOT NULL AND pda.expires_at <= now()) AS is_expired
        FROM project_department_access pda
      `),
      pool.query(`
        SELECT d.department_id, d.name, d.head_user_id,
               u.name AS head_name
        FROM departments d
        LEFT JOIN users u ON u.user_id = d.head_user_id
        ORDER BY d.name
      `),
    ]);

    res.json({
      users: users.rows,
      projects: projects.rows,
      user_grants: userGrants.rows,
      dept_grants: deptGrants.rows,
      departments: departments.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// GET /api/access/graph — nodes + edges for Cytoscape graph view
// Nodes: users, departments, projects
// Edges: all access relationships (explicit grants + implicit from confidentiality)
// ─────────────────────────────────────────────────────────────────────
router.get('/graph', auth, requireRole('admin', 'lead'), async (req, res) => {
  try {
    const [users, projects, userGrants, deptGrants, departments] = await Promise.all([
      pool.query(`SELECT user_id, name, department_id, active FROM users WHERE active = true`),
      pool.query(`SELECT project_id, name, confidentiality_level, department_id, created_by FROM projects`),
      pool.query(`
        SELECT user_id, project_id, access_level,
               (expires_at IS NOT NULL AND expires_at <= now()) AS is_expired
        FROM user_project_access
      `),
      pool.query(`
        SELECT department_id, project_id, access_level,
               (expires_at IS NOT NULL AND expires_at <= now()) AS is_expired
        FROM project_department_access
      `),
      pool.query(`SELECT department_id, name, head_user_id FROM departments`),
    ]);

    const nodes = [];
    const edges = [];

    // Department nodes
    for (const d of departments.rows) {
      nodes.push({
        id: `dept-${d.department_id}`,
        type: 'department',
        label: d.name,
        data: { department_id: d.department_id, head_user_id: d.head_user_id },
      });
    }

    // User nodes + user→department membership edges
    for (const u of users.rows) {
      nodes.push({
        id: `user-${u.user_id}`,
        type: 'user',
        label: u.name,
        data: { user_id: u.user_id, department_id: u.department_id },
      });
      if (u.department_id) {
        edges.push({
          source: `user-${u.user_id}`,
          target: `dept-${u.department_id}`,
          type: 'member_of',
        });
      }
    }

    // Project nodes
    for (const p of projects.rows) {
      nodes.push({
        id: `project-${p.project_id}`,
        type: 'project',
        label: p.name,
        data: {
          project_id: p.project_id,
          confidentiality_level: p.confidentiality_level,
          department_id: p.department_id,
          created_by: p.created_by,
        },
      });

      // Implicit access edges
      if (p.confidentiality_level === 'public') {
        // Public projects: edge from a virtual "all" node (skip to keep graph clean)
        // Alternatively mark the project node as public via data
      } else if (p.confidentiality_level === 'department' && p.department_id) {
        edges.push({
          source: `dept-${p.department_id}`,
          target: `project-${p.project_id}`,
          type: 'implicit_dept',
          access_level: 'view',
        });
      }
    }

    // Explicit user grants
    for (const g of userGrants.rows) {
      if (g.is_expired) continue;
      edges.push({
        source: `user-${g.user_id}`,
        target: `project-${g.project_id}`,
        type: 'grant_user',
        access_level: g.access_level,
      });
    }

    // Explicit department grants
    for (const g of deptGrants.rows) {
      if (g.is_expired) continue;
      edges.push({
        source: `dept-${g.department_id}`,
        target: `project-${g.project_id}`,
        type: 'grant_dept',
        access_level: g.access_level,
      });
    }

    res.json({ nodes, edges });
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

    // Enrich user/dept names in payloads (batch query)
    const userIds = new Set();
    const deptIds = new Set();
    for (const r of rows) {
      if (r.payload?.userIds) r.payload.userIds.forEach(id => userIds.add(id));
      if (r.payload?.deptIds) r.payload.deptIds.forEach(id => deptIds.add(id));
    }

    const [usersLookup, deptsLookup] = await Promise.all([
      userIds.size
        ? pool.query(`SELECT user_id, name FROM users WHERE user_id = ANY($1::int[])`, [[...userIds]])
        : Promise.resolve({ rows: [] }),
      deptIds.size
        ? pool.query(`SELECT department_id, name FROM departments WHERE department_id = ANY($1::int[])`, [[...deptIds]])
        : Promise.resolve({ rows: [] }),
    ]);

    const userNames = Object.fromEntries(usersLookup.rows.map(r => [r.user_id, r.name]));
    const deptNames = Object.fromEntries(deptsLookup.rows.map(r => [r.department_id, r.name]));

    for (const r of rows) {
      if (r.payload?.userIds) {
        r.payload.user_names = r.payload.userIds.map(id => userNames[id] || `#${id}`);
      }
      if (r.payload?.deptIds) {
        r.payload.dept_names = r.payload.deptIds.map(id => deptNames[id] || `#${id}`);
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
          WHEN p.confidentiality_level = 'public' THEN 'public'
          WHEN p.confidentiality_level = 'department' AND p.department_id = $2 THEN 'own_department'
          WHEN EXISTS (
            SELECT 1 FROM user_project_access upa
            WHERE upa.project_id = p.project_id AND upa.user_id = $1
              AND (upa.expires_at IS NULL OR upa.expires_at > now())
          ) THEN 'direct_grant'
          WHEN EXISTS (
            SELECT 1 FROM project_department_access pda
            WHERE pda.project_id = p.project_id AND pda.department_id = $2
              AND (pda.expires_at IS NULL OR pda.expires_at > now())
          ) THEN 'department_grant'
          WHEN EXISTS (
            SELECT 1 FROM users creator
            JOIN departments dd ON dd.department_id = creator.department_id
            WHERE creator.user_id = p.created_by AND dd.head_user_id = $1
          ) THEN 'dept_head'
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
        OR (p.confidentiality_level = 'department' AND p.department_id = $2)
        OR EXISTS (
          SELECT 1 FROM user_project_access upa
          WHERE upa.project_id = p.project_id AND upa.user_id = $1
            AND (upa.expires_at IS NULL OR upa.expires_at > now())
        )
        OR ($2::integer IS NOT NULL AND EXISTS (
          SELECT 1 FROM project_department_access pda
          WHERE pda.project_id = p.project_id AND pda.department_id = $2
            AND (pda.expires_at IS NULL OR pda.expires_at > now())
        ))
        OR EXISTS (
          SELECT 1 FROM users creator
          JOIN departments dd ON dd.department_id = creator.department_id
          WHERE creator.user_id = p.created_by AND dd.head_user_id = $1
        )
        OR $3::boolean = true  -- director sees all
      )
      ORDER BY p.project_id, p.name
    `, [userId, me.department_id, isDirector]);

    // Group by access source
    const grouped = {
      public: [],
      own_department: [],
      direct_grant: [],
      department_grant: [],
      dept_head: [],
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
