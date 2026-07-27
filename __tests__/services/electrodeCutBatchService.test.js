// Unit tests for getElectrodeCutBatchDeleteCheck (delete-check preflight contract).
//
// No real DB — we mock the pg pool's query() with scripted responses, the same
// way the frontend tests mock the api service. This locks the delete-check
// response shape the guided-delete UI (Vue + vanilla) depends on:
//   { can_delete, error, dependencies }
//
// getElectrodeCutBatchDeleteCheck runs, in order:
//   1) SELECT cut_batch_id FROM electrode_cut_batches  (existence -> 404 if none)
//   2..4) the three dependency checks (electrodes, battery_electrode_sources,
//         battery_electrodes); a dependency is recorded only when its query
//         returns rows.

import { describe, it, expect, vi } from 'vitest';
import { getElectrodeCutBatchDeleteCheck } from '../../services/electrodeCutBatchService.js';

function mockPool() {
  return { query: vi.fn() };
}

describe('getElectrodeCutBatchDeleteCheck', () => {
  it('throws 404 when the batch does not exist', async () => {
    const pool = mockPool();
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // existence SELECT
    await expect(getElectrodeCutBatchDeleteCheck(pool, 999)).rejects.toThrow(/не найдена/);
  });

  it('can_delete=true with no dependencies when nothing links the batch', async () => {
    const pool = mockPool();
    // existence SELECT (rowCount 1) + all dependency checks return no rows
    pool.query.mockResolvedValue({ rowCount: 1, rows: [] });
    const res = await getElectrodeCutBatchDeleteCheck(pool, 7);
    expect(res.can_delete).toBe(true);
    expect(res.error).toBe(null);
    expect(res.dependencies).toEqual([]);
  });

  it('can_delete=false + dependencies when electrodes still belong to the batch', async () => {
    const pool = mockPool();
    pool.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ cut_batch_id: 7 }] }) // exists
      .mockResolvedValueOnce({ rows: [{ id: 11, name: 3 }] })             // electrodes dep (non-empty)
      .mockResolvedValue({ rows: [] });                                   // remaining deps empty
    const res = await getElectrodeCutBatchDeleteCheck(pool, 7);
    expect(res.can_delete).toBe(false);
    expect(res.error).toBeTruthy();
    expect(res.dependencies).toHaveLength(1);
    expect(res.dependencies[0].key).toBe('electrodes');
  });
});
