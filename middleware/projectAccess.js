// ═══════════════════════════════════════════════════════════════════
// Project-access middleware — R1 entity-route enforcement (2026-07)
// ═══════════════════════════════════════════════════════════════════
// Express guards that sit AFTER `auth` on lab-data routes:
//
//   router.get('/:id',    auth, requireEntityView('tape'),   handler)
//   router.put('/:id',    auth, requireEntityModify('tape'), handler)
//   router.post('/',      auth, requireCreateInProjects(resolvePids), handler)
//
// Semantics (see services/projectAccessService.js for the model):
//   view   → any access level on ANY of the item's projects
//   modify → 'edit' or 'admin' on ANY of the item's projects
// Status codes match the projects routes: 400 bad id, 404 missing,
// 403 denied, 500 server error. Russian bodies match app convention.
//
// The user's access context is computed ONCE per request and cached on
// `req` — several guards / handler-side filters share it for free.
// Dev AUTH_BYPASS is untouched: the bypass user is a real DB user, so the
// context loads normally (bypass default is an admin → full access).
// ═══════════════════════════════════════════════════════════════════

const pool = require('../db/pool');
const {
  loadUserAccessContext,
  getEntityProjectIds,
  getEntityProjectIdsBatch,
  canView,
  canModify,
  notFoundMessage,
} = require('../services/projectAccessService');

/** Per-request cached access context (also used by list-filtering handlers). */
async function getAccessContext(req) {
  if (!req._projectAccessCtx) {
    req._projectAccessCtx = await loadUserAccessContext(pool, req.user.userId);
  }
  return req._projectAccessCtx;
}

function makeGuard(entityType, opts, checkFn, deniedMessage) {
  const idParam = (opts && opts.idParam) || 'id';
  return async function projectAccessGuard(req, res, next) {
    try {
      const id = Number(req.params[idParam]);
      if (!Number.isInteger(id)) {
        return res.status(400).json({ error: 'Некорректный ID' });
      }
      const ctx = await getAccessContext(req);
      const { exists, projectIds } = await getEntityProjectIds(pool, entityType, id);
      if (!exists) {
        return res.status(404).json({ error: notFoundMessage(entityType) });
      }
      if (!checkFn(ctx, projectIds)) {
        return res.status(403).json({ error: deniedMessage });
      }
      // Handlers may reuse the linkage (e.g. to avoid a second lookup).
      req.entityProjectIds = projectIds;
      next();
    } catch (err) {
      console.error('projectAccess guard error:', err);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  };
}

/** Gate a read of one entity: any access to any of its projects. */
function requireEntityView(entityType, opts) {
  return makeGuard(entityType, opts, canView, 'Нет доступа к записи');
}

/** Gate a write/delete of one entity: edit/admin on any of its projects. */
function requireEntityModify(entityType, opts) {
  return makeGuard(entityType, opts, canModify, 'Недостаточно прав для изменения записи');
}

/**
 * Gate a CREATE: the route supplies a resolver that derives the target
 * project ids from the request (body project_id(s), or parent entity —
 * e.g. a new cut batch inherits its tape's projects).
 *
 * resolveProjectIds(req, pool) →
 *   { projectIds: number[] }            — check edit/admin on ANY of them
 *   { error: { status, message } }      — short-circuit (bad input / 404)
 */
function requireCreateInProjects(resolveProjectIds) {
  return async function projectCreateGuard(req, res, next) {
    try {
      const resolved = await resolveProjectIds(req, pool);
      if (resolved && resolved.error) {
        return res.status(resolved.error.status).json({ error: resolved.error.message });
      }
      const projectIds = (resolved && resolved.projectIds) || [];
      const ctx = await getAccessContext(req);
      if (!canModify(ctx, projectIds)) {
        return res.status(403).json({ error: 'Недостаточно прав для создания записи в этом проекте' });
      }
      req.entityProjectIds = projectIds;
      next();
    } catch (err) {
      console.error('projectAccess create guard error:', err);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  };
}

/**
 * Filter a list-endpoint result down to rows the user may VIEW.
 * One batched linkage query; skipped entirely for admin/director.
 *
 *   const rows = await listTapes(pool);
 *   res.json(await filterRowsByEntityAccess(req, 'tape', rows, 'tape_id'));
 */
async function filterRowsByEntityAccess(req, entityType, rows, idField) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  const ctx = await getAccessContext(req);
  if (ctx.all) return rows;
  const map = await getEntityProjectIdsBatch(pool, entityType, rows.map((r) => r[idField]));
  return rows.filter((r) => canView(ctx, map.get(Number(r[idField])) || []));
}

module.exports = {
  getAccessContext,
  requireEntityView,
  requireEntityModify,
  requireCreateInProjects,
  filterRowsByEntityAccess,
};
