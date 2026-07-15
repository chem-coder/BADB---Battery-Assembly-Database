// Unit tests for services/projectAccessService.js — R1 enforcement core.
//
// The resolveProjectAccess block is a 1:1 port of the client suite
// (client-web/__tests__/utils/projectAccess.test.js) — the server resolver
// must behave IDENTICALLY to the UI's, or the matrix the user sees and what
// the API enforces would disagree. If a case changes here, change it there.
//
// The context/linkage/can* blocks are server-only (mock pool, matching the
// style of the other service tests in this directory).

import { describe, it, expect, vi } from 'vitest';
import {
  UNLINKED_ITEM_POLICY,
  resolveProjectAccess,
  loadUserAccessContext,
  getEntityProjectIds,
  getEntityProjectIdsBatch,
  canView,
  canModify,
  notFoundMessage,
} from '../../services/projectAccessService.js';

function mockPool() {
  return { query: vi.fn() };
}

// ── resolveProjectAccess — ported 1:1 from the client suite ──────────
describe('resolveProjectAccess (server port — must match client)', () => {
  const plainUser = { user_id: 1, role: 'employee', position: 'инженер' };
  const confidentialProject = {
    project_id: 10,
    confidentiality_level: 'confidential',
    lead_id: 999,
    created_by: 999,
  };
  const publicProject = { ...confidentialProject, confidentiality_level: 'public' };
  const grant = (access_level, is_expired = false) => ({ access_level, is_expired });

  it('admin role → admin/admin', () => {
    const u = { ...plainUser, role: 'admin' };
    expect(resolveProjectAccess(u, confidentialProject, null, false, false)).toEqual({
      level: 'admin',
      source: 'admin',
      is_expired: false,
    });
  });

  it('director by position → admin/director', () => {
    const u = { ...plainUser, position: 'Генеральный директор' };
    expect(resolveProjectAccess(u, confidentialProject, null, false, false)).toEqual({
      level: 'admin',
      source: 'director',
      is_expired: false,
    });
  });

  it('project lead → admin/lead', () => {
    const p = { ...confidentialProject, lead_id: 1 };
    expect(resolveProjectAccess(plainUser, p, null, false, false)).toEqual({
      level: 'admin',
      source: 'lead',
      is_expired: false,
    });
  });

  it('project owner (created_by) → admin/owner', () => {
    const p = { ...confidentialProject, lead_id: null, created_by: 1 };
    expect(resolveProjectAccess(plainUser, p, null, false, false)).toEqual({
      level: 'admin',
      source: 'owner',
      is_expired: false,
    });
  });

  it('direct grant of each level → that level, source direct', () => {
    for (const level of ['view', 'edit', 'admin']) {
      expect(
        resolveProjectAccess(plainUser, confidentialProject, grant(level), false, false),
      ).toEqual({ level, source: 'direct', is_expired: false });
    }
  });

  it('team participant on a restricted project (no grant) → null — membership alone grants nothing', () => {
    expect(resolveProjectAccess(plainUser, confidentialProject, null, true, false)).toBeNull();
  });

  it('team participant on a public project (no grant) → view/participant', () => {
    expect(resolveProjectAccess(plainUser, publicProject, null, true, false)).toEqual({
      level: 'view',
      source: 'participant',
      is_expired: false,
    });
  });

  it('public project → view/public', () => {
    expect(resolveProjectAccess(plainUser, publicProject, null, false, false)).toEqual({
      level: 'view',
      source: 'public',
      is_expired: false,
    });
  });

  it('no signal at all → null', () => {
    expect(resolveProjectAccess(plainUser, confidentialProject, null, false, false)).toBeNull();
  });

  it('lead beats a view grant', () => {
    const p = { ...confidentialProject, lead_id: 1 };
    expect(
      resolveProjectAccess(plainUser, p, grant('view'), false, false).source,
    ).toBe('lead');
  });

  it('admin role beats participant/public', () => {
    const u = { ...plainUser, role: 'admin' };
    expect(resolveProjectAccess(u, publicProject, null, true, false).source).toBe('admin');
  });

  it('an admin grant beats participant and public', () => {
    const res = resolveProjectAccess(plainUser, publicProject, grant('admin'), true, false);
    expect(res).toEqual({ level: 'admin', source: 'direct', is_expired: false });
  });

  it('expired grant on a restricted project → null, even for a participant', () => {
    const res = resolveProjectAccess(plainUser, confidentialProject, grant('edit', true), true, false);
    expect(res).toBeNull();
  });

  it('expired grant on a public project → downgraded to view (open baseline)', () => {
    const res = resolveProjectAccess(plainUser, publicProject, grant('edit', true), false, false);
    expect(res).toEqual({ level: 'view', source: 'public', is_expired: false });
  });

  it('expired grant + showExpired=true → returns the grant with is_expired:true', () => {
    const res = resolveProjectAccess(plainUser, confidentialProject, grant('edit', true), false, true);
    expect(res).toEqual({ level: 'edit', source: 'direct', is_expired: true });
  });

  it("a 'none' grant denies access — even on a public project", () => {
    expect(resolveProjectAccess(plainUser, publicProject, grant('none'), true, false)).toBeNull();
    expect(resolveProjectAccess(plainUser, confidentialProject, grant('none'), false, false)).toBeNull();
  });

  it('admin role still wins over a none grant (role is checked before the grant)', () => {
    const adminU = { ...plainUser, role: 'admin' };
    expect(resolveProjectAccess(adminU, publicProject, grant('none'), false, false).source).toBe('admin');
  });

  it('inactive user → null, regardless of grant or role', () => {
    const dead = { ...plainUser, active: false, role: 'admin' };
    expect(resolveProjectAccess(dead, publicProject, grant('admin'), true, false)).toBeNull();
  });
});

// ── canView / canModify against a loaded context ─────────────────────
describe('canView / canModify', () => {
  const activeUser = { user_id: 1, role: 'employee', position: 'инженер', active: true };
  const ctxWith = (entries, all = false) => ({
    user: activeUser,
    all,
    map: new Map(Object.entries(entries).map(([k, v]) => [Number(k), v])),
  });

  it('view level → canView but NOT canModify', () => {
    const ctx = ctxWith({ 5: 'view' });
    expect(canView(ctx, [5])).toBe(true);
    expect(canModify(ctx, [5])).toBe(false);
  });

  it('edit level → both', () => {
    const ctx = ctxWith({ 5: 'edit' });
    expect(canView(ctx, [5])).toBe(true);
    expect(canModify(ctx, [5])).toBe(true);
  });

  it('admin level → both', () => {
    const ctx = ctxWith({ 5: 'admin' });
    expect(canModify(ctx, [5])).toBe(true);
  });

  it('no level on any of the item projects → neither', () => {
    const ctx = ctxWith({ 5: 'edit' });
    expect(canView(ctx, [7, 9])).toBe(false);
    expect(canModify(ctx, [7, 9])).toBe(false);
  });

  it('multi-project item: ANY ONE accessible project suffices', () => {
    const ctx = ctxWith({ 5: 'edit' });
    expect(canView(ctx, [7, 5, 9])).toBe(true);
    expect(canModify(ctx, [7, 5, 9])).toBe(true);
  });

  it("multi-project: a 'view' on one + nothing on others → view only", () => {
    const ctx = ctxWith({ 5: 'view' });
    expect(canView(ctx, [7, 5])).toBe(true);
    expect(canModify(ctx, [7, 5])).toBe(false);
  });

  it("all:'admin' (admin/director) → everything", () => {
    const ctx = ctxWith({}, 'admin');
    expect(canView(ctx, [123])).toBe(true);
    expect(canModify(ctx, [123])).toBe(true);
  });

  it('unlinked item honours UNLINKED_ITEM_POLICY (open today)', () => {
    const ctx = ctxWith({});
    const expected = UNLINKED_ITEM_POLICY === 'open';
    expect(canView(ctx, [])).toBe(expected);
    expect(canModify(ctx, [])).toBe(expected);
  });

  it('inactive or missing user → nothing, even for unlinked items', () => {
    const dead = { ...activeUser, active: false };
    expect(canView({ user: dead, all: false, map: new Map() }, [])).toBe(false);
    expect(canModify({ user: null, all: false, map: new Map() }, [])).toBe(false);
  });
});

// ── loadUserAccessContext (mock pool) ────────────────────────────────
describe('loadUserAccessContext', () => {
  it('admin role short-circuits to all:admin without the projects query', async () => {
    const pool = mockPool();
    pool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ user_id: 4, role: 'admin', position: 'x', active: true }],
    });
    const ctx = await loadUserAccessContext(pool, 4);
    expect(ctx.all).toBe('admin');
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('director position short-circuits to all:admin', async () => {
    const pool = mockPool();
    pool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ user_id: 20, role: 'lead', position: 'Директор по науке', active: true }],
    });
    const ctx = await loadUserAccessContext(pool, 20);
    expect(ctx.all).toBe('admin');
  });

  it('inactive user → empty map, all:false', async () => {
    const pool = mockPool();
    pool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ user_id: 9, role: 'admin', position: '', active: false }],
    });
    const ctx = await loadUserAccessContext(pool, 9);
    expect(ctx.all).toBe(false);
    expect(ctx.map.size).toBe(0);
  });

  it('unknown user → user:null, empty map', async () => {
    const pool = mockPool();
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const ctx = await loadUserAccessContext(pool, 12345);
    expect(ctx.user).toBeNull();
    expect(ctx.map.size).toBe(0);
  });

  it('ordinary user: builds the map from grants/membership/baseline', async () => {
    const pool = mockPool();
    pool.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ user_id: 12, role: 'employee', position: 'специалист', active: true }],
      })
      .mockResolvedValueOnce({
        rowCount: 4,
        rows: [
          // edit grant on restricted project 5
          { project_id: 5, confidentiality_level: 'confidential', lead_id: 20, created_by: 4, access_level: 'edit', is_expired: false, is_participant: true },
          // expired grant on restricted project 13 → nothing
          { project_id: 13, confidentiality_level: 'confidential', lead_id: 4, created_by: 4, access_level: 'edit', is_expired: true, is_participant: true },
          // public project, no grant → baseline view
          { project_id: 2, confidentiality_level: 'public', lead_id: 4, created_by: 4, access_level: null, is_expired: false, is_participant: false },
          // 'none' deny on public project 3 → nothing
          { project_id: 3, confidentiality_level: 'public', lead_id: 4, created_by: 4, access_level: 'none', is_expired: false, is_participant: false },
        ],
      });
    const ctx = await loadUserAccessContext(pool, 12);
    expect(ctx.all).toBe(false);
    expect(ctx.map.get(5)).toBe('edit');
    expect(ctx.map.has(13)).toBe(false);
    expect(ctx.map.get(2)).toBe('view');
    expect(ctx.map.has(3)).toBe(false);
  });
});

// ── entity → project linkage (mock pool) ─────────────────────────────
describe('getEntityProjectIds / Batch', () => {
  it('maps rows into id → project id lists; missing entity absent from map', async () => {
    const pool = mockPool();
    pool.query.mockResolvedValueOnce({
      rowCount: 3,
      rows: [
        { id: 10, project_id: 1 },
        { id: 10, project_id: 4 },
        { id: 11, project_id: null }, // exists but unlinked
      ],
    });
    const map = await getEntityProjectIdsBatch(pool, 'tape', [10, 11, 99]);
    expect(map.get(10)).toEqual([1, 4]);
    expect(map.get(11)).toEqual([]);
    expect(map.has(99)).toBe(false);
  });

  it('single-entity wrapper reports exists/projectIds', async () => {
    const pool = mockPool();
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 7, project_id: 5 }] });
    expect(await getEntityProjectIds(pool, 'battery', 7)).toEqual({ exists: true, projectIds: [5] });

    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    expect(await getEntityProjectIds(pool, 'battery', 999)).toEqual({ exists: false, projectIds: [] });
  });

  it('rejects unknown entity types loudly', async () => {
    const pool = mockPool();
    await expect(getEntityProjectIdsBatch(pool, 'nonsense', [1])).rejects.toThrow(/Unknown entity type/);
  });

  it('has a Russian 404 message per entity type', () => {
    expect(notFoundMessage('tape')).toBe('Лента не найдена');
    expect(notFoundMessage('cyclingSession')).toBe('Сессия не найдена');
    expect(notFoundMessage('whatever')).toBe('Запись не найдена');
  });
});
