// Unit tests for src/utils/materialComposition.js
//
// The Vue Materials full-composition editor must enforce the same rules vanilla
// does in public/js/materials.js openCompositionEditor before it hits the
// canonical replace-all PUT /api/materials/instances/:id/components, and those
// rules mirror the backend services/materialCompositionService.js
// normalizeCompositionPayload:
//   - at least one component;
//   - each component is a real instance, not the parent (no self-reference);
//   - no duplicate component;
//   - each mass fraction ∈ (0, 1];
//   - the fractions sum to exactly 100% (within COMPOSITION_TOLERANCE).
//
// Per-component inline edit/delete intentionally do NOT use this util — vanilla
// leaves those single-row ops un-revalidated and Vue matches that.

import { describe, it, expect } from 'vitest';
import {
  COMPOSITION_TOLERANCE,
  percentToFraction,
  sumPercent,
  validateComposition,
} from '@/utils/materialComposition';

const PARENT = 100;
// Editor-row shorthand: { component_material_instance_id, percent, notes }
const row = (id, percent, notes) => ({ component_material_instance_id: id, percent, notes });

describe('COMPOSITION_TOLERANCE', () => {
  it('matches the backend tolerance (0.0001)', () => {
    expect(COMPOSITION_TOLERANCE).toBe(0.0001);
  });
});

describe('percentToFraction', () => {
  it('converts a 0..100 percent (number or string) to a 0..1 fraction', () => {
    expect(percentToFraction(50)).toBe(0.5);
    expect(percentToFraction('25')).toBe(0.25);
    expect(percentToFraction('100')).toBe(1);
  });
  it('returns NaN for blank / non-numeric input', () => {
    expect(Number.isNaN(percentToFraction(''))).toBe(true);
    expect(Number.isNaN(percentToFraction(null))).toBe(true);
    expect(Number.isNaN(percentToFraction(undefined))).toBe(true);
    expect(Number.isNaN(percentToFraction('abc'))).toBe(true);
  });
});

describe('sumPercent', () => {
  it('sums the entered percents, ignoring blank/garbage rows', () => {
    expect(sumPercent([row(1, '33.33'), row(2, '33.34')])).toBeCloseTo(66.67, 5);
    expect(sumPercent([row(1, '60'), row(2, ''), row(3, 'abc')])).toBe(60);
  });
  it('is 0 for an empty / nullish list', () => {
    expect(sumPercent([])).toBe(0);
    expect(sumPercent(null)).toBe(0);
  });
});

describe('validateComposition', () => {
  it('accepts a valid composition summing to exactly 100% and normalizes it', () => {
    const result = validateComposition(
      [row(5, '60', ' binder '), row(6, '40', '')],
      PARENT
    );
    expect(result.ok).toBe(true);
    expect(result.components).toEqual([
      { component_material_instance_id: 5, mass_fraction: 0.6, notes: 'binder' },
      { component_material_instance_id: 6, mass_fraction: 0.4, notes: null },
    ]);
  });

  it('accepts component ids given as numeric strings (PrimeVue Select values)', () => {
    const result = validateComposition([row('5', '70'), row('6', '30')], PARENT);
    expect(result.ok).toBe(true);
    expect(result.components.map((c) => c.component_material_instance_id)).toEqual([5, 6]);
  });

  it('tolerates floating-point rounding (33.33 / 33.33 / 33.34)', () => {
    const result = validateComposition(
      [row(5, '33.33'), row(6, '33.33'), row(7, '33.34')],
      PARENT
    );
    expect(result.ok).toBe(true);
  });

  it('rejects an empty / non-array composition', () => {
    expect(validateComposition([], PARENT)).toEqual({
      ok: false,
      error: expect.stringMatching(/хотя бы один/),
    });
    expect(validateComposition(null, PARENT).ok).toBe(false);
  });

  it('rejects a self-referential component (component === parent)', () => {
    const result = validateComposition([row(PARENT, '100')], PARENT);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/сам себя/);
  });

  it('rejects duplicate components', () => {
    const result = validateComposition([row(5, '50'), row(5, '50')], PARENT);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/дважды/);
  });

  it('rejects a blank / zero / non-positive component id', () => {
    expect(validateComposition([row('', '100')], PARENT).error).toMatch(/Заполните/);
    expect(validateComposition([row(0, '100')], PARENT).error).toMatch(/Заполните/);
    expect(validateComposition([row(-3, '100')], PARENT).error).toMatch(/Заполните/);
  });

  it('rejects a mass fraction of 0, blank, or above 100%', () => {
    expect(validateComposition([row(5, '0')], PARENT).error).toMatch(/Заполните/);
    expect(validateComposition([row(5, '')], PARENT).error).toMatch(/Заполните/);
    expect(validateComposition([row(5, '150')], PARENT).error).toMatch(/Заполните/);
  });

  it('rejects a composition that does not sum to 100%', () => {
    const low = validateComposition([row(5, '50'), row(6, '30')], PARENT);
    expect(low.ok).toBe(false);
    expect(low.error).toMatch(/100%/);

    const high = validateComposition([row(5, '60'), row(6, '60')], PARENT);
    expect(high.ok).toBe(false);
    expect(high.error).toMatch(/100%/);
  });
});
