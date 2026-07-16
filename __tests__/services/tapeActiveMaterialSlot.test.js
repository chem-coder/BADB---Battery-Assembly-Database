// Tests for the d047 "active material slot" behavior: recipes carry an open
// active line (material_id NULL); the tape names its chemistry via
// tapes.active_material_id. No real DB — pool is mocked per test.
import { describe, expect, it, vi } from 'vitest';
import { computeTapeMixtureRows } from '../../services/tapeWorkflowService.js';
import { saveTapeActual } from '../../services/tapeActualService.js';

function mockPool(responses) {
  const query = vi.fn();
  responses.forEach((rows) => {
    query.mockResolvedValueOnce({ rows, rowCount: rows.length });
  });
  return { query };
}

describe('computeTapeMixtureRows with an unfilled active slot', () => {
  const baseTape = { calc_mode: 'from_active_mass', target_mass_g: 100 };

  const lines = (activeMaterialId) => [
    {
      recipe_line_id: 1,
      recipe_role: 'cathode_active',
      include_in_pct: true,
      slurry_percent: 96,
      material_id: activeMaterialId,
      material_instance_id: activeMaterialId === null ? null : 101,
      instance_name: activeMaterialId === null ? null : 'NMC C85E (чистый)'
    },
    {
      recipe_line_id: 2,
      recipe_role: 'binder',
      include_in_pct: true,
      slurry_percent: 4,
      material_id: 13,
      material_instance_id: 24,
      instance_name: 'PVDF (сухой)'
    }
  ];

  it('does not bucket the slot line under material 0 when no active material is chosen', () => {
    const rows = computeTapeMixtureRows({
      tape: baseTape,
      recipeLines: lines(null),
      componentsByInstanceId: new Map()
    });

    const slotRow = rows.find((row) => row.recipe_line_id === 1);
    expect(slotRow.target_quantity_g).toBeNull();

    // The binder line still computes from the active percent.
    const binderRow = rows.find((row) => row.recipe_line_id === 2);
    expect(binderRow.target_quantity_g).toBeCloseTo(100 * (4 / 96), 6);
  });

  it('computes the slot line once the tape has resolved its active material', () => {
    const rows = computeTapeMixtureRows({
      tape: baseTape,
      recipeLines: lines(7),
      componentsByInstanceId: new Map()
    });

    const slotRow = rows.find((row) => row.recipe_line_id === 1);
    expect(slotRow.target_quantity_g).toBeCloseTo(100, 6);
  });
});

describe('saveTapeActual instance/material guard', () => {
  const payload = {
    recipe_line_id: 5,
    material_instance_id: 42,
    measure_mode: 'mass',
    actual_mass_g: 10,
    actual_volume_ml: null
  };

  it('rejects an instance of the wrong material on a regular line', async () => {
    const pool = mockPool([
      [{ expected_material_id: 13, is_active_slot: false, instance_material_id: 14 }]
    ]);

    await expect(saveTapeActual(pool, 1, payload)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Экземпляр не принадлежит материалу строки рецепта'
    });
  });

  it('requires the tape to choose an active material before slot actuals', async () => {
    const pool = mockPool([
      [{ expected_material_id: null, is_active_slot: true, instance_material_id: 14 }]
    ]);

    await expect(saveTapeActual(pool, 1, payload)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Сначала выберите активный материал ленты'
    });
  });

  it('rejects a slot instance that belongs to a different material than the tape chose', async () => {
    const pool = mockPool([
      [{ expected_material_id: 7, is_active_slot: true, instance_material_id: 14 }]
    ]);

    await expect(saveTapeActual(pool, 1, payload)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Экземпляр должен принадлежать активному материалу ленты'
    });
  });

  it('saves when the slot instance matches the tape active material', async () => {
    const savedRow = { actual_id: 9, tape_id: 1, recipe_line_id: 5 };
    const pool = mockPool([
      [{ expected_material_id: 7, is_active_slot: true, instance_material_id: 7 }],
      [savedRow]
    ]);

    await expect(saveTapeActual(pool, 1, payload)).resolves.toEqual(savedRow);
    expect(pool.query).toHaveBeenCalledTimes(2);
  });
});
