// ═══════════════════════════════════════════════════════════════════
// Project Access Service — R1 entity-route enforcement (2026-07)
// ═══════════════════════════════════════════════════════════════════
// WHAT THIS IS (plain language):
// Lab data (tapes, electrode batches, batteries, cycling sessions) belongs
// to projects. This service answers one question for the backend:
//   "May THIS user see / change THIS item?"
// based on the item's project links and the user's access to those projects.
//
// The access model is the SAME 4-level model the UI already uses
// (client-web/src/utils/projectAccess.js — resolveProjectAccess, 29 tests).
// The resolver below is a deliberate 1:1 port of that function; if you
// change one, change the other. Levels, strongest first:
//
//   admin — edit the project + its data      (Администратор)
//   edit  — CRUD the project's data          (Обычный, default for members)
//   view  — read-only                        (Просмотр)
//   none  — explicit deny, beats even public (Нет доступа)
//
// Extra rules: expired grant auto-downgrades to the project baseline
// (public → view, restricted → nothing); deactivated user → nothing;
// admin role / director position / project lead / creator → full override.
//
// An item linked to SEVERAL projects is accessible if the user can access
// ANY ONE of them ("if you can see the project, you can see its items").
// ═══════════════════════════════════════════════════════════════════

// Items with NO project link at all (no governing project).
//   VIEW  → open: any logged-in user may see them. Nothing confidential
//           governs an unlinked item, and this matches pre-R1 reads.
//   MODIFY → admin/director only. Editing is fail-CLOSED so that an item
//           accidentally orphaned (e.g. an update path that drops its
//           links) can never silently become world-writable. A real
//           orphan is an anomaly an admin should re-link, not a free-for-all.
// As of 2026-07-15 every item in the DB is linked, so this affects nothing
// today — it's a safety floor. Flip UNLINKED_VIEW to 'restricted' to hide
// unlinked items from non-admins entirely.
const UNLINKED_VIEW = 'open';         // 'open' | 'restricted'
const UNLINKED_MODIFY = 'restricted'; // 'open' | 'restricted' (admin/director only)
// Back-compat export: the original single knob reflected the VIEW policy.
const UNLINKED_ITEM_POLICY = UNLINKED_VIEW;

/**
 * Resolve a user's effective access to ONE project.
 * 1:1 port of client-web/src/utils/projectAccess.js#resolveProjectAccess —
 * same rule order, same shapes, so the client test suite applies verbatim.
 *
 * @param {object} user    { user_id, role, position, active? }
 * @param {object} project { project_id, confidentiality_level, lead_id, created_by }
 * @param {object|null} grant { access_level, is_expired } or null
 * @param {boolean} isParticipant team membership (labels the public baseline)
 * @param {boolean} showExpired   honour expired grants (UI matrix option)
 * @returns {{level:'view'|'edit'|'admin', source:string, is_expired:boolean}|null}
 */
function resolveProjectAccess(user, project, grant, isParticipant, showExpired = false) {
  // 0. Deactivated user — no access anywhere (auth also blocks login).
  if (user.active === false) return null;

  // 1. Admin role override
  if (user.role === 'admin') return { level: 'admin', source: 'admin', is_expired: false };

  // 2. Director (by position)
  if ((user.position || '').toLowerCase().includes('директор')) {
    return { level: 'admin', source: 'director', is_expired: false };
  }

  // 3. Project lead
  if (project.lead_id != null && Number(user.user_id) === Number(project.lead_id)) {
    return { level: 'admin', source: 'lead', is_expired: false };
  }

  // 4. Project owner (creator)
  if (project.created_by != null && Number(user.user_id) === Number(project.created_by)) {
    return { level: 'admin', source: 'owner', is_expired: false };
  }

  // 5. Explicit grant — only if usable (not expired, or expired ones honoured)
  if (grant && (!grant.is_expired || showExpired)) {
    // 'none' is an explicit deny: no access even on a public project.
    if (grant.access_level === 'none') return null;
    return { level: grant.access_level, source: 'direct', is_expired: !!grant.is_expired };
  }

  // 6. Baseline — non-members AND expired/none members. Expiry downgrades to
  //    the project type's baseline; membership does NOT grant access itself.
  if (project.confidentiality_level === 'public') {
    return { level: 'view', source: isParticipant ? 'participant' : 'public', is_expired: false };
  }

  // Restricted project, no usable grant → no access.
  return null;
}

/**
 * Load everything needed to answer access questions for one user, once per
 * request: the user row + a Map of project_id → effective level.
 * Admin role / director position short-circuit to `all: 'admin'` (no map
 * needed — they can access everything).
 *
 * @returns {{ user: object|null, all: false|'admin', map: Map<number,string> }}
 */
async function loadUserAccessContext(db, userId) {
  const u = await db.query(
    'SELECT user_id, role, position, active FROM users WHERE user_id = $1',
    [userId]
  );
  if (u.rowCount === 0) return { user: null, all: false, map: new Map() };
  const user = u.rows[0];

  if (user.active === false) return { user, all: false, map: new Map() };

  if (user.role === 'admin' || (user.position || '').toLowerCase().includes('директор')) {
    return { user, all: 'admin', map: new Map() };
  }

  // One query: every project + this user's grant (with expiry flag) +
  // participant membership. The resolver then runs per project in JS.
  const r = await db.query(
    `
    SELECT p.project_id,
           p.confidentiality_level,
           p.lead_id,
           p.created_by,
           upa.access_level,
           (upa.expires_at IS NOT NULL AND upa.expires_at <= now()) AS is_expired,
           (pp.project_id IS NOT NULL) AS is_participant
    FROM projects p
    LEFT JOIN user_project_access upa
           ON upa.project_id = p.project_id AND upa.user_id = $1
    LEFT JOIN (
      SELECT DISTINCT project_id FROM project_participants WHERE user_id = $1
    ) pp ON pp.project_id = p.project_id
    `,
    [userId]
  );

  const map = new Map();
  for (const row of r.rows) {
    const grant = row.access_level
      ? { access_level: row.access_level, is_expired: row.is_expired }
      : null;
    const res = resolveProjectAccess(user, row, grant, row.is_participant, false);
    if (res) map.set(row.project_id, res.level);
  }
  return { user, all: false, map };
}

// ── Entity → project linkage ─────────────────────────────────────────
// Source of truth is ALWAYS the junction tables (many-to-many), never the
// legacy tapes.project_id / batteries.project_id single columns.
const ENTITY_LINKS = {
  tape: {
    notFound: 'Лента не найдена',
    sql: `SELECT t.tape_id AS id, tp.project_id
          FROM tapes t
          LEFT JOIN tape_projects tp ON tp.tape_id = t.tape_id
          WHERE t.tape_id = ANY($1)`,
  },
  cutBatch: {
    notFound: 'Партия электродов не найдена',
    sql: `SELECT b.cut_batch_id AS id, j.project_id
          FROM electrode_cut_batches b
          LEFT JOIN electrode_cut_batch_projects j ON j.cut_batch_id = b.cut_batch_id
          WHERE b.cut_batch_id = ANY($1)`,
  },
  electrode: {
    notFound: 'Электрод не найден',
    sql: `SELECT e.electrode_id AS id, j.project_id
          FROM electrodes e
          JOIN electrode_cut_batches b ON b.cut_batch_id = e.cut_batch_id
          LEFT JOIN electrode_cut_batch_projects j ON j.cut_batch_id = b.cut_batch_id
          WHERE e.electrode_id = ANY($1)`,
  },
  battery: {
    notFound: 'Аккумулятор не найден',
    sql: `SELECT b.battery_id AS id, j.project_id
          FROM batteries b
          LEFT JOIN battery_projects j ON j.battery_id = b.battery_id
          WHERE b.battery_id = ANY($1)`,
  },
  cyclingSession: {
    notFound: 'Сессия не найдена',
    sql: `SELECT cs.session_id AS id, j.project_id
          FROM cycling_sessions cs
          JOIN batteries b ON b.battery_id = cs.battery_id
          LEFT JOIN battery_projects j ON j.battery_id = b.battery_id
          WHERE cs.session_id = ANY($1)`,
  },
  // Child records of a cut batch — access follows the parent batch's projects.
  foilMeasurement: {
    notFound: 'Измерение не найдено',
    sql: `SELECT m.foil_measurement_id AS id, j.project_id
          FROM foil_mass_measurements m
          LEFT JOIN electrode_cut_batch_projects j ON j.cut_batch_id = m.cut_batch_id
          WHERE m.foil_measurement_id = ANY($1)`,
  },
  electrodeDrying: {
    notFound: 'Запись сушки не найдена',
    sql: `SELECT d.drying_id AS id, j.project_id
          FROM electrode_drying d
          LEFT JOIN electrode_cut_batch_projects j ON j.cut_batch_id = d.cut_batch_id
          WHERE d.drying_id = ANY($1)`,
  },
  // Child record of a battery — access follows the battery's projects.
  batteryElectrochem: {
    notFound: 'Файл испытаний не найден',
    sql: `SELECT e.battery_electrochem_id AS id, j.project_id
          FROM battery_electrochem e
          LEFT JOIN battery_projects j ON j.battery_id = e.battery_id
          WHERE e.battery_electrochem_id = ANY($1)`,
  },
};

function notFoundMessage(entityType) {
  return (ENTITY_LINKS[entityType] || {}).notFound || 'Запись не найдена';
}

/**
 * Batch: project ids for many entities in ONE query.
 * @returns {Map<number, number[]>} entity id → project ids (id absent = entity doesn't exist)
 */
async function getEntityProjectIdsBatch(db, entityType, ids) {
  const cfg = ENTITY_LINKS[entityType];
  if (!cfg) throw new Error(`Unknown entity type for access check: ${entityType}`);
  const clean = [...new Set(ids.map(Number).filter(Number.isInteger))];
  if (clean.length === 0) return new Map();

  const r = await db.query(cfg.sql, [clean]);
  const map = new Map();
  for (const row of r.rows) {
    if (!map.has(row.id)) map.set(row.id, []);
    if (row.project_id != null) map.get(row.id).push(row.project_id);
  }
  return map;
}

/** Single entity: { exists, projectIds }. */
async function getEntityProjectIds(db, entityType, id) {
  const map = await getEntityProjectIdsBatch(db, entityType, [id]);
  const key = Number(id);
  return { exists: map.has(key), projectIds: map.get(key) || [] };
}

// ── Boolean checks against a loaded context ──────────────────────────
function canView(ctx, projectIds) {
  if (!ctx.user || ctx.user.active === false) return false;
  if (ctx.all) return true;
  if (!projectIds || projectIds.length === 0) return UNLINKED_VIEW === 'open';
  return projectIds.some((pid) => ctx.map.has(pid));
}

function canModify(ctx, projectIds) {
  if (!ctx.user || ctx.user.active === false) return false;
  if (ctx.all) return true;
  // Unlinked items: fail-closed — only admin/director (handled by ctx.all
  // above) may modify. See UNLINKED_MODIFY.
  if (!projectIds || projectIds.length === 0) return UNLINKED_MODIFY === 'open';
  return projectIds.some((pid) => {
    const level = ctx.map.get(pid);
    return level === 'edit' || level === 'admin';
  });
}

module.exports = {
  UNLINKED_ITEM_POLICY,
  UNLINKED_VIEW,
  UNLINKED_MODIFY,
  resolveProjectAccess,
  loadUserAccessContext,
  getEntityProjectIds,
  getEntityProjectIdsBatch,
  canView,
  canModify,
  notFoundMessage,
};
