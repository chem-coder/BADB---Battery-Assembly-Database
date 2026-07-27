// Unit tests for src/utils/electrodeDelete.js
//
// Electrode-cut-batch guided delete contract (frontend). Mirrors vanilla
// public/js/2-electrodes.js: typed phrase `DELETE BATCH <id>` + delete-check
// blockers. The phrase is a UX confirmation guardrail; the backend enforces
// the dependency blockers.

import { describe, it, expect } from 'vitest';
import { electrodeBatchDeletePhrase, electrodeDeleteBlockers } from '@/utils/electrodeDelete';

describe('electrodeBatchDeletePhrase', () => {
  it('builds the exact vanilla phrase DELETE BATCH <id>', () => {
    expect(electrodeBatchDeletePhrase(7)).toBe('DELETE BATCH 7');
    expect(electrodeBatchDeletePhrase('42')).toBe('DELETE BATCH 42');
  });
});

describe('electrodeDeleteBlockers', () => {
  it('returns [] for no / nullish dependencies', () => {
    expect(electrodeDeleteBlockers([])).toEqual([]);
    expect(electrodeDeleteBlockers(null)).toEqual([]);
    expect(electrodeDeleteBlockers(undefined)).toEqual([]);
  });

  it('maps dependency rows to "label (count)" strings', () => {
    const deps = [
      { key: 'electrodes', label: 'электроды в партии', count: 3 },
      { key: 'battery_electrodes', label: 'аккумуляторы с электродами', count: 1 },
    ];
    expect(electrodeDeleteBlockers(deps)).toEqual([
      'электроды в партии (3)',
      'аккумуляторы с электродами (1)',
    ]);
  });

  it('falls back to the bare label when count is absent', () => {
    expect(electrodeDeleteBlockers([{ label: 'связанные записи' }])).toEqual(['связанные записи']);
  });
});
