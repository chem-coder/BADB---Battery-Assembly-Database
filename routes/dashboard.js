const express = require('express');
const router = express.Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');

// ── GET /api/dashboard/kpi ────────────────────────────────────────────
// Returns counts and breakdowns for all entity types
router.get('/kpi', auth, async (req, res) => {
  try {
    const { period, project_id, operator_id } = req.query // '7d', '30d', '90d', 'all'
    const dateFilter = periodToDateFilter(period)
    const operatorFilter = operator_id ? Number(operator_id) : null
    const projectFilterKpi = project_id ? Number(project_id) : null

    // Build dynamic WHERE clauses for tapes
    const tapeConditions = []
    const tapeParams = []
    if (dateFilter) { tapeParams.push(dateFilter); tapeConditions.push(`t.created_at >= $${tapeParams.length}`) }
    if (operatorFilter) { tapeParams.push(operatorFilter); tapeConditions.push(`t.created_by = $${tapeParams.length}`) }
    if (projectFilterKpi) { tapeParams.push(projectFilterKpi); tapeConditions.push(`t.project_id = $${tapeParams.length}`) }
    const tapeWhere = tapeConditions.length ? `WHERE ${tapeConditions.join(' AND ')}` : ''

    const [tapes, electrodes, batteries, projects, materials, recipes] = await Promise.all([
      pool.query(`
        SELECT
          count(*) AS total,
          count(*) FILTER (WHERE step_count >= 8) AS completed,
          count(*) FILTER (WHERE step_count < 8 OR step_count IS NULL) AS in_progress
        FROM (
          SELECT t.tape_id,
            (SELECT count(*) FROM tape_process_steps s WHERE s.tape_id = t.tape_id AND s.performed_by IS NOT NULL) AS step_count
          FROM tapes t
          ${tapeWhere}
        ) sub
      `, tapeParams),

      pool.query(`
        SELECT
          count(DISTINCT b.cut_batch_id) AS batches,
          count(e.electrode_id) AS electrodes
        FROM electrode_cut_batches b
        LEFT JOIN electrodes e ON e.cut_batch_id = b.cut_batch_id
        ${dateFilter ? `WHERE b.created_at >= $1` : ''}
      `, dateFilter ? [dateFilter] : []),

      pool.query(`
        SELECT
          count(*) AS total,
          count(*) FILTER (WHERE status = 'assembled') AS assembled,
          count(*) FILTER (WHERE status = 'testing') AS testing,
          count(*) FILTER (WHERE status = 'completed') AS completed
        FROM batteries
        ${dateFilter ? `WHERE created_at >= $1` : ''}
      `, dateFilter ? [dateFilter] : []),

      pool.query(`
        SELECT
          count(*) AS total,
          count(*) FILTER (WHERE status = 'active') AS active,
          count(*) FILTER (WHERE status = 'completed') AS completed,
          count(*) FILTER (WHERE status = 'paused') AS paused
        FROM projects
      `),

      pool.query(`SELECT count(*) AS total FROM materials`),
      pool.query(`SELECT count(*) AS total FROM tape_recipes`),
    ])

    res.json({
      tapes: tapes.rows[0],
      electrodes: electrodes.rows[0],
      batteries: batteries.rows[0],
      projects: projects.rows[0],
      materials: materials.rows[0],
      recipes: recipes.rows[0],
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка загрузки KPI' })
  }
})

// ── GET /api/dashboard/filter-options ──────────────────────────────────
// Returns available filter values with counts
router.get('/filter-options', auth, async (req, res) => {
  try {
    const [projects, operators] = await Promise.all([
      pool.query(`
        SELECT p.project_id AS id, p.name, count(t.tape_id) AS tape_count
        FROM projects p
        LEFT JOIN tapes t ON t.project_id = p.project_id
        GROUP BY p.project_id, p.name
        ORDER BY p.name
      `),
      pool.query(`
        SELECT u.user_id AS id, u.name, count(t.tape_id) AS tape_count
        FROM users u
        LEFT JOIN tapes t ON t.created_by = u.user_id
        WHERE u.active = true
        GROUP BY u.user_id, u.name
        ORDER BY u.name
      `),
    ])

    res.json({
      projects: projects.rows,
      operators: operators.rows,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка загрузки фильтров' })
  }
})

// ── GET /api/dashboard/activity ───────────────────────────────────────
// Returns recent activity events for the HomePage timeline.
//
// Originally read just `activity_log`, which is barely populated —
// migrations/012_activity_log.sql seeded 6 fake rows but no CRUD
// route writes to it on real edits, so the timeline was stuck on
// those seeds (user reported them as «неправильная информация»).
//
// Now unions three real sources into a single timeline:
//   - auth_log         → login / register / logout events (real, per
//                        every actual session)
//   - field_changelog  → per-field edits (real, written by traceability
//                        triggers/code on every CRUD edit)
//   - activity_log     → legacy table; kept in for the seed entries
//                        until they're cleaned out
//
// Each source is normalized into the shape the frontend already
// renders: { id, user_id, user_name, action, entity, entity_id,
// details, created_at }. `id` is namespaced by source prefix to
// avoid collisions across the three integer PKs (e.g. `auth-42`,
// `chg-13`, `act-7`).
router.get('/activity', auth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 100)

    const result = await pool.query(`
      SELECT id, user_id, user_name, action, entity, entity_id, details, created_at FROM (
        -- Logins / registrations / logouts (real auth events)
        SELECT
          'auth-' || al.id              AS id,
          al.user_id                    AS user_id,
          COALESCE(u.name, al.login)    AS user_name,
          al.event                      AS action,
          'auth'                        AS entity,
          al.user_id                    AS entity_id,
          al.details                    AS details,
          al.created_at                 AS created_at
        FROM auth_log al
        LEFT JOIN users u ON u.user_id = al.user_id
        WHERE al.event IN ('login_success', 'register', 'logout')

        UNION ALL

        -- Per-field edits via the traceability trigger
        SELECT
          'chg-' || fc.id               AS id,
          fc.changed_by                 AS user_id,
          u.name                        AS user_name,
          'edit'                        AS action,
          fc.entity_type                AS entity,
          fc.entity_id                  AS entity_id,
          jsonb_build_object(
            'field', fc.field_name,
            'old', fc.old_value,
            'new', fc.new_value
          )                             AS details,
          fc.changed_at                 AS created_at
        FROM field_changelog fc
        LEFT JOIN users u ON u.user_id = fc.changed_by

        UNION ALL

        -- Legacy CRUD log (mostly seed data, kept for back-compat)
        SELECT
          'act-' || a.id                AS id,
          a.user_id                     AS user_id,
          u.name                        AS user_name,
          a.action                      AS action,
          a.entity                      AS entity,
          a.entity_id                   AS entity_id,
          a.details                     AS details,
          a.created_at                  AS created_at
        FROM activity_log a
        LEFT JOIN users u ON u.user_id = a.user_id
      ) merged
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit])

    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка загрузки активности' })
  }
})

// ── GET /api/dashboard/production ─────────────────────────────────────
// Returns production counts per week for chart
router.get('/production', auth, async (req, res) => {
  try {
    const weeks = Math.min(Number(req.query.weeks) || 12, 52)

    const result = await pool.query(`
      WITH weeks AS (
        SELECT generate_series(
          date_trunc('week', now()) - ($1 - 1) * interval '1 week',
          date_trunc('week', now()),
          interval '1 week'
        ) AS week_start
      )
      SELECT
        w.week_start,
        COALESCE(t.tape_count, 0) AS tapes,
        COALESCE(e.batch_count, 0) AS electrode_batches,
        COALESCE(b.battery_count, 0) AS batteries
      FROM weeks w
      LEFT JOIN (
        SELECT date_trunc('week', created_at) AS wk, count(*) AS tape_count
        FROM tapes GROUP BY wk
      ) t ON t.wk = w.week_start
      LEFT JOIN (
        SELECT date_trunc('week', created_at) AS wk, count(*) AS batch_count
        FROM electrode_cut_batches GROUP BY wk
      ) e ON e.wk = w.week_start
      LEFT JOIN (
        SELECT date_trunc('week', created_at) AS wk, count(*) AS battery_count
        FROM batteries GROUP BY wk
      ) b ON b.wk = w.week_start
      ORDER BY w.week_start
    `, [weeks])

    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка загрузки production data' })
  }
})

// ── GET /api/dashboard/graph ───────────────────────────────────────────
// Returns nodes + edges for entity relationship graph (Cytoscape.js)
router.get('/graph', auth, async (req, res) => {
  try {
    const projectFilter = req.query.project_id ? Number(req.query.project_id) : null
    const operatorFilterGraph = req.query.operator_id ? Number(req.query.operator_id) : null
    const limit = Math.min(Number(req.query.limit) || 200, 500)

    // Build dynamic WHERE for tapes in graph
    const graphConditions = []
    const graphParams = []
    if (projectFilter) { graphParams.push(projectFilter); graphConditions.push(`t.project_id = $${graphParams.length}`) }
    if (operatorFilterGraph) { graphParams.push(operatorFilterGraph); graphConditions.push(`t.created_by = $${graphParams.length}`) }
    const graphTapeWhere = graphConditions.length ? `WHERE ${graphConditions.join(' AND ')}` : ''
    graphParams.push(limit)
    const graphLimitParam = `$${graphParams.length}`

    // Fetch all entity data in parallel
    const [projects, tapes, recipes, recipeLines, materials, batches, batteries,
           separators, structures, electrolytes] = await Promise.all([
      pool.query(`SELECT project_id, name, status FROM projects ${projectFilter ? 'WHERE project_id = $1' : ''} ORDER BY project_id`, projectFilter ? [projectFilter] : []),
      pool.query(`
        SELECT t.tape_id, t.name, t.project_id, t.tape_recipe_id, t.created_by,
               u.name AS operator_name
        FROM tapes t LEFT JOIN users u ON u.user_id = t.created_by
        ${graphTapeWhere}
        ORDER BY t.tape_id DESC LIMIT ${graphLimitParam}
      `, graphParams),
      pool.query(`SELECT tape_recipe_id, name, role FROM tape_recipes`),
      pool.query(`SELECT tape_recipe_id, material_id FROM tape_recipe_lines`),
      pool.query(`SELECT m.material_id, m.name, m.role FROM materials m`),
      pool.query(`
        SELECT b.cut_batch_id, b.tape_id, count(e.electrode_id) AS electrode_count
        FROM electrode_cut_batches b
        LEFT JOIN electrodes e ON e.cut_batch_id = b.cut_batch_id
        GROUP BY b.cut_batch_id, b.tape_id
      `),
      pool.query(`
        SELECT bt.battery_id, bt.project_id, bt.form_factor,
               bs.tape_id AS source_tape_id, bs.cut_batch_id AS source_batch_id
        FROM batteries bt
        LEFT JOIN battery_electrode_sources bs ON bs.battery_id = bt.battery_id
        ${projectFilter ? 'WHERE bt.project_id = $1' : ''}
      `, projectFilter ? [projectFilter] : []),
      pool.query(`SELECT sep_id, name, structure_id, created_by FROM separators`),
      pool.query(`SELECT sep_str_id, name FROM separator_structure`),
      pool.query(`SELECT electrolyte_id, name, electrolyte_type, created_by FROM electrolytes`),
    ])

    const nodes = []
    const edges = []
    const nodeSet = new Set()

    function addNode(id, type, label, data = {}) {
      if (nodeSet.has(id)) return
      nodeSet.add(id)
      nodes.push({ id, type, label, data })
    }

    // Projects
    for (const p of projects.rows) {
      addNode(`project-${p.project_id}`, 'project', p.name, { status: p.status })
    }

    // Tapes
    for (const t of tapes.rows) {
      addNode(`tape-${t.tape_id}`, 'tape', t.name || `Лента #${t.tape_id}`, { operator: t.operator_name })
      if (t.project_id) edges.push({ source: `project-${t.project_id}`, target: `tape-${t.tape_id}`, type: 'contains' })
      if (t.tape_recipe_id) edges.push({ source: `tape-${t.tape_id}`, target: `recipe-${t.tape_recipe_id}`, type: 'uses_recipe' })
    }

    // Materials (all — they are the foundation)
    const materialMap = new Map()
    for (const m of materials.rows) {
      materialMap.set(m.material_id, m)
      addNode(`material-${m.material_id}`, 'material', m.name, { role: m.role })
    }

    // Recipes
    for (const r of recipes.rows) {
      addNode(`recipe-${r.tape_recipe_id}`, 'recipe', r.name, { role: r.role })
    }

    // Recipe → Material edges (via recipe_lines)
    for (const rl of recipeLines.rows) {
      if (nodeSet.has(`recipe-${rl.tape_recipe_id}`) && nodeSet.has(`material-${rl.material_id}`)) {
        edges.push({ source: `material-${rl.material_id}`, target: `recipe-${rl.tape_recipe_id}`, type: 'used_in_recipe' })
      }
    }

    // Tape → Recipe edges
    for (const t of tapes.rows) {
      if (t.tape_recipe_id) edges.push({ source: `recipe-${t.tape_recipe_id}`, target: `tape-${t.tape_id}`, type: 'uses_recipe' })
    }

    // Electrode batches
    const tapeIds = new Set(tapes.rows.map(t => t.tape_id))
    for (const b of batches.rows) {
      addNode(`batch-${b.cut_batch_id}`, 'electrode_batch', `Партия #${b.cut_batch_id}`, { electrodes: b.electrode_count })
      if (tapeIds.has(b.tape_id)) {
        edges.push({ source: `tape-${b.tape_id}`, target: `batch-${b.cut_batch_id}`, type: 'cut_from' })
      }
    }

    // Separators + structures
    for (const s of structures.rows) {
      addNode(`structure-${s.sep_str_id}`, 'sep_structure', s.name)
    }
    for (const s of separators.rows) {
      addNode(`separator-${s.sep_id}`, 'separator', s.name)
      if (s.structure_id) edges.push({ source: `structure-${s.structure_id}`, target: `separator-${s.sep_id}`, type: 'has_structure' })
    }

    // Electrolytes
    for (const el of electrolytes.rows) {
      addNode(`electrolyte-${el.electrolyte_id}`, 'electrolyte', el.name, { type: el.electrolyte_type })
    }

    // Batteries (with links to separators, electrolytes, electrode batches)
    for (const bt of batteries.rows) {
      addNode(`battery-${bt.battery_id}`, 'battery', `${bt.form_factor || 'Акк.'} #${bt.battery_id}`, { form_factor: bt.form_factor })
      if (bt.project_id) edges.push({ source: `project-${bt.project_id}`, target: `battery-${bt.battery_id}`, type: 'contains' })
      if (bt.source_batch_id) edges.push({ source: `batch-${bt.source_batch_id}`, target: `battery-${bt.battery_id}`, type: 'assembled_into' })
      if (bt.source_tape_id) edges.push({ source: `tape-${bt.source_tape_id}`, target: `battery-${bt.battery_id}`, type: 'source_tape' })
    }

    // Filter edges to only reference existing nodes
    const validEdges = edges.filter(e => nodeSet.has(e.source) && nodeSet.has(e.target))

    res.json({ nodes, edges: validEdges })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка загрузки графа' })
  }
})

// ── GET /api/dashboard/funnel ─────────────────────────────────────────
// Returns conversion funnel: recipes → tapes → electrode batches → batteries
router.get('/funnel', auth, async (req, res) => {
  try {
    const dateFilter = periodToDateFilter(req.query.period)

    const [recipes, tapes, batches, batteries] = await Promise.all([
      pool.query(`SELECT count(*) AS total FROM tape_recipes`),
      pool.query(`SELECT count(*) AS total FROM tapes ${dateFilter ? 'WHERE created_at >= $1' : ''}`, dateFilter ? [dateFilter] : []),
      pool.query(`SELECT count(*) AS total FROM electrode_cut_batches ${dateFilter ? 'WHERE created_at >= $1' : ''}`, dateFilter ? [dateFilter] : []),
      pool.query(`SELECT count(*) AS total FROM batteries ${dateFilter ? 'WHERE created_at >= $1' : ''}`, dateFilter ? [dateFilter] : []),
    ])

    res.json([
      { stage: 'Рецептуры', count: Number(recipes.rows[0].total) },
      { stage: 'Ленты', count: Number(tapes.rows[0].total) },
      { stage: 'Электроды', count: Number(batches.rows[0].total) },
      { stage: 'Аккумуляторы', count: Number(batteries.rows[0].total) },
    ])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка загрузки воронки' })
  }
})

// ── GET /api/dashboard/materials-usage ────────────────────────────────
// Returns material usage counts grouped by role
router.get('/materials-usage', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.material_id, m.name, m.role,
             count(rl.tape_recipe_id) AS usage_count
      FROM materials m
      LEFT JOIN tape_recipe_lines rl ON rl.material_id = m.material_id
      GROUP BY m.material_id, m.name, m.role
      ORDER BY m.role, usage_count DESC
    `)

    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка загрузки материалов' })
  }
})

// ── Helper ────────────────────────────────────────────────────────────
function periodToDateFilter(period) {
  if (!period || period === 'all') return null
  const days = { '7d': 7, '30d': 30, '90d': 90, 'ytd': 365 }
  const d = days[period]
  if (!d) return null
  const date = new Date()
  date.setDate(date.getDate() - d)
  return date.toISOString()
}

module.exports = router;
