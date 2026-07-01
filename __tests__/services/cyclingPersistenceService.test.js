// Unit tests for services/cyclingPersistenceService.js
//
// Focused on the atomicity contract: persistParserOutput must use a single
// transaction (BEGIN ... COMMIT) and ROLLBACK on any failure during the
// multi-table write sequence.
//
// We don't have a test DB; pg is mocked. The tests verify call sequence
// and contract — they cannot catch SQL syntax errors. SQL is exercised
// via npm run smoke:vanilla / manual upload tests.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  persistParserOutput,
  recordParserError,
  DATAPOINTS_BATCH_SIZE,
} from '../../services/cyclingPersistenceService.js';

// ── Mock helpers ──────────────────────────────────────────────────────

/**
 * Build a mock pg client that records every query call.
 * Optionally, makeFail(callIdx, errorMessage) configures the Nth query()
 * call to reject with the given error.
 */
function makeMockClient({ failOnCallIndex = -1, failError = 'boom' } = {}) {
  const calls = [];
  let released = false;

  return {
    calls,
    isReleased: () => released,
    query: vi.fn(async (sql, params) => {
      const callIdx = calls.length;
      calls.push({ sql: typeof sql === 'string' ? sql : sql.text, params });
      if (callIdx === failOnCallIndex) {
        throw new Error(failError);
      }
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(() => {
      released = true;
    }),
  };
}

/**
 * Build a mock pg pool. connect() returns the given client; query() can
 * be inspected separately (used by recordParserError).
 */
function makeMockPool(client) {
  return {
    connect: vi.fn(async () => client),
    query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
  };
}

const sampleResult = {
  datapoints: [
    { cycle_number: 1, voltage_v: 3.7, current_a: 0.5, time_s: 0 },
    { cycle_number: 1, voltage_v: 3.8, current_a: 0.5, time_s: 1 },
  ],
  summary: [
    {
      cycle_number: 1,
      charge_capacity_ah: 0.1,
      discharge_capacity_ah: 0.095,
      coulombic_efficiency: 95.0,
    },
  ],
  meta: { total_cycles: 1, detected_format: 'elitech' },
};

// ── Tests ─────────────────────────────────────────────────────────────

describe('cyclingPersistenceService', () => {
  describe('persistParserOutput — happy path', () => {
    let client;
    let pool;

    beforeEach(() => {
      client = makeMockClient();
      pool = makeMockPool(client);
    });

    it('wraps writes in a transaction (BEGIN ... COMMIT)', async () => {
      await persistParserOutput(pool, 42, sampleResult);

      const sqls = client.calls.map((c) => c.sql.trim().split(/\s+/)[0]);
      expect(sqls[0]).toBe('BEGIN');
      expect(sqls[sqls.length - 1]).toBe('COMMIT');
    });

    it('inserts datapoints, summary, then updates session — in order', async () => {
      await persistParserOutput(pool, 42, sampleResult);

      const tables = client.calls
        .map((c) => {
          if (/INSERT INTO cycling_datapoints/i.test(c.sql)) return 'datapoints';
          if (/INSERT INTO cycling_cycle_summary/i.test(c.sql)) return 'summary';
          if (/UPDATE cycling_sessions/i.test(c.sql)) return 'session';
          return null;
        })
        .filter(Boolean);

      expect(tables).toEqual(['datapoints', 'summary', 'session']);
    });

    it('returns { ok: true } on success', async () => {
      const result = await persistParserOutput(pool, 42, sampleResult);
      expect(result).toEqual({ ok: true });
    });

    it('releases the client after success', async () => {
      await persistParserOutput(pool, 42, sampleResult);
      expect(client.release).toHaveBeenCalledTimes(1);
      expect(client.isReleased()).toBe(true);
    });

    it('uses pool.connect() exactly once (single transaction, not per-statement)', async () => {
      await persistParserOutput(pool, 42, sampleResult);
      expect(pool.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe('persistParserOutput — failure paths', () => {
    it('ROLLBACK is called when datapoints insert fails', async () => {
      // Call order: 0=BEGIN, 1=datapoints INSERT
      const client = makeMockClient({ failOnCallIndex: 1, failError: 'dp boom' });
      const pool = makeMockPool(client);

      await expect(persistParserOutput(pool, 42, sampleResult)).rejects.toThrow(/dp boom/);

      const lastCall = client.calls[client.calls.length - 1];
      expect(lastCall.sql).toBe('ROLLBACK');
    });

    it('ROLLBACK is called when summary upsert fails', async () => {
      // Call order: 0=BEGIN, 1=datapoints, 2=summary INSERT
      const client = makeMockClient({ failOnCallIndex: 2, failError: 'summary boom' });
      const pool = makeMockPool(client);

      await expect(persistParserOutput(pool, 42, sampleResult)).rejects.toThrow(/summary boom/);

      const lastCall = client.calls[client.calls.length - 1];
      expect(lastCall.sql).toBe('ROLLBACK');
    });

    it('ROLLBACK is called when final session UPDATE fails', async () => {
      // Call order: 0=BEGIN, 1=datapoints, 2=summary, 3=session UPDATE
      const client = makeMockClient({ failOnCallIndex: 3, failError: 'finalize boom' });
      const pool = makeMockPool(client);

      await expect(persistParserOutput(pool, 42, sampleResult)).rejects.toThrow(/finalize boom/);

      const lastCall = client.calls[client.calls.length - 1];
      expect(lastCall.sql).toBe('ROLLBACK');
    });

    it('NO COMMIT is issued when a write fails', async () => {
      const client = makeMockClient({ failOnCallIndex: 2, failError: 'boom' });
      const pool = makeMockPool(client);

      await expect(persistParserOutput(pool, 42, sampleResult)).rejects.toThrow();

      const sqls = client.calls.map((c) => c.sql.trim().split(/\s+/)[0]);
      expect(sqls).not.toContain('COMMIT');
    });

    it('still releases the client when transaction fails', async () => {
      const client = makeMockClient({ failOnCallIndex: 1, failError: 'boom' });
      const pool = makeMockPool(client);

      await expect(persistParserOutput(pool, 42, sampleResult)).rejects.toThrow();

      expect(client.release).toHaveBeenCalledTimes(1);
      expect(client.isReleased()).toBe(true);
    });

    it('swallows a failed ROLLBACK without masking the original error', async () => {
      // BEGIN ok, INSERT fails, then ROLLBACK ALSO fails. The original error
      // is what the caller should see.
      const client = makeMockClient();
      let callIdx = 0;
      client.query = vi.fn(async (sql) => {
        client.calls.push({ sql: typeof sql === 'string' ? sql : sql.text });
        callIdx += 1;
        if (callIdx === 2) throw new Error('original insert failure');
        if (callIdx > 2) throw new Error('rollback also failed');
        return { rows: [], rowCount: 0 };
      });
      const pool = makeMockPool(client);

      await expect(persistParserOutput(pool, 42, sampleResult)).rejects.toThrow(/original insert failure/);

      // Release still happened
      expect(client.release).toHaveBeenCalledTimes(1);
    });
  });

  describe('persistParserOutput — batching', () => {
    it('issues one INSERT per datapoint batch of DATAPOINTS_BATCH_SIZE', async () => {
      // Create datapoints across 2.5 batches → 3 INSERT calls
      const datapoints = Array.from(
        { length: DATAPOINTS_BATCH_SIZE * 2 + 100 },
        (_, i) => ({ cycle_number: 1, voltage_v: 3.7, current_a: 0.5, time_s: i }),
      );

      const client = makeMockClient();
      const pool = makeMockPool(client);

      await persistParserOutput(pool, 42, {
        ...sampleResult,
        datapoints,
      });

      const dpInserts = client.calls.filter((c) =>
        /INSERT INTO cycling_datapoints/i.test(c.sql),
      );
      expect(dpInserts).toHaveLength(3);
    });

    it('handles empty datapoints (still finalizes session)', async () => {
      const client = makeMockClient();
      const pool = makeMockPool(client);

      await persistParserOutput(pool, 42, {
        datapoints: [],
        summary: [],
        meta: { total_cycles: 0, detected_format: null },
      });

      const sqls = client.calls.map((c) => c.sql.trim().split(/\s+/)[0]);
      expect(sqls).toContain('BEGIN');
      expect(sqls).toContain('UPDATE');
      expect(sqls).toContain('COMMIT');
    });
  });

  describe('recordParserError', () => {
    it('issues a single UPDATE on the pool (not on a client connection)', async () => {
      const pool = makeMockPool(null);

      await recordParserError(pool, 42, 'parser exploded');

      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(pool.connect).not.toHaveBeenCalled();

      const call = pool.query.mock.calls[0];
      expect(call[0]).toMatch(/UPDATE cycling_sessions/);
      expect(call[1]).toEqual(['parser exploded', 42]);
    });

    it('coerces undefined / null error messages to a placeholder', async () => {
      const pool = makeMockPool(null);

      await recordParserError(pool, 42, null);

      const call = pool.query.mock.calls[0];
      expect(call[1][0]).toBe('unknown error');
    });
  });
});
