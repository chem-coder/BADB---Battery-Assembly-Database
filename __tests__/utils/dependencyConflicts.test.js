// Unit tests for utils/dependencyConflicts.js
//
// These helpers are used by route DELETE handlers (tapes, electrodes,
// batteries) to surface "can't delete: still in use elsewhere" errors
// uniformly to the frontend. They run before the actual DELETE — so a
// regression here shows up as either silent deletes (data loss) or
// false 500s.
//
// We mock the `db` parameter and the Express `res` object — no real DB
// or HTTP traffic.

import { describe, it, expect, vi } from 'vitest';
import {
  collectDependencyConflicts,
  sendDependencyConflict,
  sendForeignKeyConflict,
} from '../../utils/dependencyConflicts.js';

describe('collectDependencyConflicts', () => {
  function mockDb(responses) {
    // responses: array of result objects matching the order of checks
    let callIndex = 0;
    return {
      query: vi.fn(async () => {
        const r = responses[callIndex++];
        return r;
      }),
    };
  }

  it('returns empty array when no checks have rows', async () => {
    const db = mockDb([
      { rows: [] },
      { rows: [] },
    ]);
    const checks = [
      { key: 'a', label: 'A', query: 'SELECT 1' },
      { key: 'b', label: 'B', query: 'SELECT 2' },
    ];
    const result = await collectDependencyConflicts(db, checks);
    expect(result).toEqual([]);
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  it('collects rows for each non-empty check', async () => {
    const db = mockDb([
      { rows: [{ id: 1, name: 'foo' }, { id: 2, name: 'bar' }] },
      { rows: [{ id: 5 }] },
    ]);
    const checks = [
      { key: 'tapes', label: 'Tapes', query: 'q1' },
      { key: 'batteries', label: 'Batteries', query: 'q2' },
    ];
    const result = await collectDependencyConflicts(db, checks);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      key: 'tapes',
      label: 'Tapes',
      count: 2,
      records: [{ id: 1, name: 'foo' }, { id: 2, name: 'bar' }],
    });
    expect(result[1]).toMatchObject({
      key: 'batteries',
      label: 'Batteries',
      count: 1,
      records: [{ id: 5 }],
    });
  });

  it('compacts null/undefined fields out of records (cleans display)', async () => {
    const db = mockDb([
      { rows: [{ id: 1, name: 'foo', deleted_at: null, comment: undefined }] },
    ]);
    const checks = [{ key: 'k', label: 'L', query: 'q' }];
    const result = await collectDependencyConflicts(db, checks);
    expect(result[0].records[0]).toEqual({ id: 1, name: 'foo' });
    expect(result[0].records[0].deleted_at).toBeUndefined();
    expect(result[0].records[0].comment).toBeUndefined();
  });

  it('keeps zero/false/empty-string values (not null-ish)', async () => {
    const db = mockDb([
      { rows: [{ id: 0, active: false, name: '' }] },
    ]);
    const checks = [{ key: 'k', label: 'L', query: 'q' }];
    const result = await collectDependencyConflicts(db, checks);
    expect(result[0].records[0]).toEqual({ id: 0, active: false, name: '' });
  });

  it('passes params to db.query when provided', async () => {
    const db = mockDb([{ rows: [] }]);
    const checks = [{ key: 'k', label: 'L', query: 'SELECT $1', params: [42] }];
    await collectDependencyConflicts(db, checks);
    expect(db.query).toHaveBeenCalledWith('SELECT $1', [42]);
  });

  it('passes empty params array when params omitted', async () => {
    const db = mockDb([{ rows: [] }]);
    const checks = [{ key: 'k', label: 'L', query: 'SELECT 1' }];
    await collectDependencyConflicts(db, checks);
    expect(db.query).toHaveBeenCalledWith('SELECT 1', []);
  });

  it('handles undefined rows gracefully (returns empty for that check)', async () => {
    const db = mockDb([{ rows: undefined }]);
    const checks = [{ key: 'k', label: 'L', query: 'q' }];
    const result = await collectDependencyConflicts(db, checks);
    expect(result).toEqual([]);
  });
});

describe('sendDependencyConflict', () => {
  function mockRes() {
    const res = {
      status: vi.fn(() => res),
      json: vi.fn(() => res),
    };
    return res;
  }

  it('responds with 409 + error + dependencies', () => {
    const res = mockRes();
    const deps = [{ key: 'tapes', count: 2 }];
    sendDependencyConflict(res, 'Cannot delete', deps);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Cannot delete',
      dependencies: deps,
    });
  });
});

describe('sendForeignKeyConflict', () => {
  function mockRes() {
    const res = {
      status: vi.fn(() => res),
      json: vi.fn(() => res),
    };
    return res;
  }

  it('returns false for non-23503 errors (no response sent)', () => {
    const res = mockRes();
    const err = { code: '12345' };
    const handled = sendForeignKeyConflict(res, err, 'fallback');
    expect(handled).toBe(false);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns false when err is null/undefined', () => {
    const res = mockRes();
    expect(sendForeignKeyConflict(res, null, 'msg')).toBe(false);
    expect(sendForeignKeyConflict(res, undefined, 'msg')).toBe(false);
  });

  it('handles 23503 (FK violation) → 409 + constraint name', () => {
    const res = mockRes();
    const err = { code: '23503', constraint: 'fk_some_constraint' };
    const handled = sendForeignKeyConflict(res, err, 'Cannot delete: FK');
    expect(handled).toBe(true);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Cannot delete: FK',
      constraint: 'fk_some_constraint',
    });
  });

  it('handles 23503 without constraint field → constraint = null', () => {
    const res = mockRes();
    const err = { code: '23503' };
    sendForeignKeyConflict(res, err, 'msg');
    expect(res.json).toHaveBeenCalledWith({
      error: 'msg',
      constraint: null,
    });
  });
});
