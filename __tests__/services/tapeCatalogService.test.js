// Unit tests for getTapeDeleteCheck (delete-check preflight contract).
//
// No real DB — we mock the pg pool's query() with scripted responses (same
// approach as electrodeCutBatchService.test.js). Locks the delete-check
// response shape the guided-delete UI (Vue + vanilla) depends on:
//   { can_delete, error, dependencies }
//
// getTapeDeleteCheck runs: 1) SELECT tape_id (existence -> 404 if none), then
// the dependency checks; a dependency is recorded only when its query has rows.

import { describe, it, expect, vi } from 'vitest';
import { getTapeDeleteCheck } from '../../services/tapeCatalogService.js';

function mockPool() {
  return { query: vi.fn() };
}

describe('getTapeDeleteCheck', () => {
  it('throws 404 when the tape does not exist', async () => {
    const pool = mockPool();
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // existence SELECT
    await expect(getTapeDeleteCheck(pool, 999)).rejects.toThrow(/не найдена/);
  });

  it('can_delete=true with no dependencies when nothing links the tape', async () => {
    const pool = mockPool();
    pool.query.mockResolvedValue({ rowCount: 1, rows: [] });
    const res = await getTapeDeleteCheck(pool, 7);
    expect(res.can_delete).toBe(true);
    expect(res.error).toBe(null);
    expect(res.dependencies).toEqual([]);
  });

  it('can_delete=false + dependencies when the tape is linked downstream', async () => {
    const pool = mockPool();
    pool.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ tape_id: 7 }] }) // exists
      .mockResolvedValueOnce({ rows: [{ id: 3, name: 'batch-A' }] })  // first dep (non-empty)
      .mockResolvedValue({ rows: [] });                               // remaining deps empty
    const res = await getTapeDeleteCheck(pool, 7);
    expect(res.can_delete).toBe(false);
    expect(res.error).toBeTruthy();
    expect(res.dependencies).toHaveLength(1);
  });
});
