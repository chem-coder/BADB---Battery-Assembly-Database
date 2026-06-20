// Unit tests for replaceMaterialInstanceComposition (canonical replace-all
// composition contract).
//
// No real DB — we mock the pg pool, the same approach as the other service
// tests (tapeCatalogService / electrodeCutBatchService). This locks the
// sum-to-100 / no-self / no-dup / fraction-range validation that the Materials
// composition editor (Vue full editor + vanilla "Состав" editor) relies on
// behind PUT /api/materials/instances/:id/components.
//
// Invalid payloads must be rejected BEFORE any DB work (normalizeCompositionPayload
// throws synchronously), so those cases assert pool.connect was never called.
//
// This file also covers addMaterialInstanceComponent (the incremental "add one
// component" path). It carries the per-row rules (positive-int id, fraction in
// (0,1], no self-reference) but deliberately NOT sum-to-100 — only the canonical
// replace-all path enforces the whole-composition 100% rule, matching the sibling
// per-component update/delete endpoints which also skip it.

import { describe, it, expect, vi } from 'vitest';
import {
  addMaterialInstanceComponent,
  replaceMaterialInstanceComposition,
  MaterialCompositionValidationError,
} from '../../services/materialCompositionService.js';

const PARENT = 100;
const comp = (id, massFraction, notes = null) => ({
  component_material_instance_id: id,
  mass_fraction: massFraction,
  notes,
});

// A pool whose connect() should never be reached (validation rejects first).
function rejectingPool() {
  return { connect: vi.fn() };
}

// A pool wired for the happy path: connect() yields a client whose every query
// resolves empty, covering BEGIN / SELECT / DELETE / INSERT / changelog / COMMIT.
function transactionPool() {
  const client = {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: vi.fn(),
  };
  return { pool: { connect: vi.fn().mockResolvedValue(client) }, client };
}

describe('replaceMaterialInstanceComposition — validation contract', () => {
  it('rejects an empty composition before touching the pool', async () => {
    const pool = rejectingPool();
    await expect(replaceMaterialInstanceComposition(pool, PARENT, [], 1)).rejects.toBeInstanceOf(
      MaterialCompositionValidationError
    );
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('rejects a non-array composition', async () => {
    const pool = rejectingPool();
    await expect(replaceMaterialInstanceComposition(pool, PARENT, null, 1)).rejects.toThrow(
      /Состав не передан/
    );
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('rejects a self-referential component', async () => {
    const pool = rejectingPool();
    await expect(
      replaceMaterialInstanceComposition(pool, PARENT, [comp(PARENT, 1)], 1)
    ).rejects.toThrow(/сам себя/);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('rejects duplicate components', async () => {
    const pool = rejectingPool();
    await expect(
      replaceMaterialInstanceComposition(pool, PARENT, [comp(5, 0.5), comp(5, 0.5)], 1)
    ).rejects.toThrow(/дважды/);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('rejects a mass fraction of 0 or below', async () => {
    const pool = rejectingPool();
    await expect(
      replaceMaterialInstanceComposition(pool, PARENT, [comp(5, 0)], 1)
    ).rejects.toThrow(/Некорректные данные состава/);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('rejects a mass fraction above 1', async () => {
    const pool = rejectingPool();
    await expect(
      replaceMaterialInstanceComposition(pool, PARENT, [comp(5, 1.5)], 1)
    ).rejects.toThrow(/Некорректные данные состава/);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('rejects a composition that does not sum to 100%', async () => {
    const pool = rejectingPool();
    await expect(
      replaceMaterialInstanceComposition(pool, PARENT, [comp(5, 0.5), comp(6, 0.3)], 1)
    ).rejects.toThrow(/100%/);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('accepts a valid 100% composition and replaces it inside a transaction', async () => {
    const { pool, client } = transactionPool();
    await replaceMaterialInstanceComposition(pool, PARENT, [comp(5, 0.6, 'binder'), comp(6, 0.4)], 1);

    const sql = client.query.mock.calls.map((c) => String(c[0]));
    expect(sql.some((s) => /BEGIN/.test(s))).toBe(true);
    expect(sql.some((s) => /DELETE FROM material_instance_components/.test(s))).toBe(true);
    expect(sql.some((s) => /INSERT INTO material_instance_components/.test(s))).toBe(true);
    expect(sql.some((s) => /COMMIT/.test(s))).toBe(true);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('accepts the 33.33 / 33.33 / 33.34 rounding case (within tolerance)', async () => {
    const { pool } = transactionPool();
    await expect(
      replaceMaterialInstanceComposition(pool, PARENT, [comp(5, 0.3333), comp(6, 0.3333), comp(7, 0.3334)], 1)
    ).resolves.toBeDefined();
  });

  it('rolls back and rethrows if a query fails mid-transaction', async () => {
    const client = {
      query: vi.fn().mockImplementation((sql) => {
        if (/DELETE FROM material_instance_components/.test(String(sql))) {
          return Promise.reject(new Error('boom'));
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn().mockResolvedValue(client) };

    await expect(
      replaceMaterialInstanceComposition(pool, PARENT, [comp(5, 1)], 1)
    ).rejects.toThrow(/boom/);

    const sql = client.query.mock.calls.map((c) => String(c[0]));
    expect(sql.some((s) => /ROLLBACK/.test(s))).toBe(true);
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});

describe('addMaterialInstanceComponent — per-row validation', () => {
  // A pool whose query() should never be reached (validation rejects first).
  const rejectingQueryPool = () => ({ query: vi.fn() });

  it.each([0, -3, 1.5, NaN, 'abc', null, undefined])(
    'rejects a non-positive / non-integer component id (%p) before touching the pool',
    async (badId) => {
      const pool = rejectingQueryPool();
      await expect(
        addMaterialInstanceComponent(pool, PARENT, badId, 0.5)
      ).rejects.toBeInstanceOf(MaterialCompositionValidationError);
      expect(pool.query).not.toHaveBeenCalled();
    }
  );

  it('rejects a mass fraction of 0 or below', async () => {
    const pool = rejectingQueryPool();
    await expect(addMaterialInstanceComponent(pool, PARENT, 5, 0)).rejects.toThrow(
      /Некорректные данные состава/
    );
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects a mass fraction above 1', async () => {
    const pool = rejectingQueryPool();
    await expect(addMaterialInstanceComponent(pool, PARENT, 5, 1.5)).rejects.toThrow(
      /Некорректные данные состава/
    );
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric mass fraction', async () => {
    const pool = rejectingQueryPool();
    await expect(addMaterialInstanceComponent(pool, PARENT, 5, 'heavy')).rejects.toThrow(
      /Некорректные данные состава/
    );
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects a self-referential component', async () => {
    const pool = rejectingQueryPool();
    await expect(addMaterialInstanceComponent(pool, PARENT, PARENT, 0.5)).rejects.toThrow(
      /сам себя/
    );
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('inserts a valid single component and returns the joined row', async () => {
    const row = {
      material_instance_component_id: 1,
      component_material_instance_id: 5,
      mass_fraction: 0.5,
    };
    const pool = { query: vi.fn().mockResolvedValue({ rows: [row] }) };

    const result = await addMaterialInstanceComponent(pool, PARENT, 5, 0.5);

    expect(result).toEqual(row);
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(String(sql)).toMatch(/INSERT INTO material_instance_components/);
    // stores the validated/normalized values, not the raw input
    expect(params).toEqual([PARENT, 5, 0.5]);
  });

  it('does NOT enforce sum-to-100 (a single component below 100% is accepted)', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [{ ok: true }] }) };
    await expect(addMaterialInstanceComponent(pool, PARENT, 7, 0.25)).resolves.toBeDefined();
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  // The DB enforces UNIQUE(parent, component); the service turns that 23505
  // violation into a clean 400 instead of letting it surface as a 500.
  it('maps a DB unique violation (duplicate) to a 400 validation error', async () => {
    const pool = {
      query: vi.fn().mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' })),
    };
    const err = await addMaterialInstanceComponent(pool, PARENT, 5, 0.5).then(
      () => null,
      (e) => e
    );
    expect(err).toBeInstanceOf(MaterialCompositionValidationError);
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/дважды/);
  });

  it('rethrows a non-unique DB error unchanged (stays a 500 at the route)', async () => {
    const pool = {
      query: vi.fn().mockRejectedValue(Object.assign(new Error('boom'), { code: '42P01' })),
    };
    const err = await addMaterialInstanceComponent(pool, PARENT, 5, 0.5).then(
      () => null,
      (e) => e
    );
    expect(err).not.toBeInstanceOf(MaterialCompositionValidationError);
    expect(err.message).toMatch(/boom/);
  });
});
