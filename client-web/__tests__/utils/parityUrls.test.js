// Unit tests for src/utils/parityUrls.js
//
// Verifies the URL builder produces the exact param names that vanilla
// print-page JS expects (recipe_id, tape_id, project_id, electrolyte_id,
// sep_id, battery_id, cut_batch_id).

import { describe, it, expect } from 'vitest';
import { parityUrls } from '@/utils/parityUrls';

describe('parityUrls.printReport', () => {
  it('recipes uses recipe_id param', () => {
    expect(parityUrls.printReport('recipes', 42))
      .toBe('/workflow/recipe-print.html?recipe_id=42');
  });

  it('tapes uses tape_id param', () => {
    expect(parityUrls.printReport('tapes', 7))
      .toBe('/workflow/tape-print.html?tape_id=7');
  });

  it('projects uses project_id param', () => {
    expect(parityUrls.printReport('projects', 3))
      .toBe('/workflow/project-print.html?project_id=3');
  });

  it('electrolytes uses electrolyte_id param', () => {
    expect(parityUrls.printReport('electrolytes', 12))
      .toBe('/workflow/electrolyte-print.html?electrolyte_id=12');
  });

  it('separators uses sep_id param (asymmetric, verified against public/js/separator-print.js)', () => {
    expect(parityUrls.printReport('separators', 5))
      .toBe('/workflow/separator-print.html?sep_id=5');
  });

  it('batteries uses battery_id param', () => {
    expect(parityUrls.printReport('batteries', 100))
      .toBe('/workflow/battery-print.html?battery_id=100');
  });

  it('electrodes uses cut_batch_id param', () => {
    expect(parityUrls.printReport('electrodes', 88))
      .toBe('/workflow/electrode-batch-print.html?cut_batch_id=88');
  });

  it('throws on unknown entity type', () => {
    expect(() => parityUrls.printReport('users', 1)).toThrow(/unknown entityType/);
  });

  it('throws on missing id', () => {
    expect(() => parityUrls.printReport('recipes', null)).toThrow(/missing id/);
    expect(() => parityUrls.printReport('recipes', '')).toThrow(/missing id/);
  });

  it('encodes id values', () => {
    // Defensive: id should never contain special chars, but if it does
    // the URL must remain valid.
    expect(parityUrls.printReport('recipes', 'a b'))
      .toBe('/workflow/recipe-print.html?recipe_id=a%20b');
  });
});

describe('parityUrls.hasPrintReport', () => {
  it('returns true for entities with print pages', () => {
    expect(parityUrls.hasPrintReport('recipes')).toBe(true);
    expect(parityUrls.hasPrintReport('batteries')).toBe(true);
  });

  it('returns false for entities without print pages', () => {
    expect(parityUrls.hasPrintReport('users')).toBe(false);
    expect(parityUrls.hasPrintReport('departments')).toBe(false);
    expect(parityUrls.hasPrintReport('unknown')).toBe(false);
  });
});
