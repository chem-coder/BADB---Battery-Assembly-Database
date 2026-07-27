// Unit tests for src/utils/tapeDelete.js
//
// Tape guided-delete contract (frontend). Mirrors vanilla public/js/1-tapes.js:
// typed phrase `DELETE TAPE <id>` + delete-check blockers. Tape delete is
// admin/lead-gated (backend requireRole); the phrase is a UX guardrail.

import { describe, it, expect } from 'vitest';
import { tapeDeletePhrase, tapeDeleteBlockers } from '@/utils/tapeDelete';

describe('tapeDeletePhrase', () => {
  it('builds the exact vanilla phrase DELETE TAPE <id>', () => {
    expect(tapeDeletePhrase(7)).toBe('DELETE TAPE 7');
    expect(tapeDeletePhrase('42')).toBe('DELETE TAPE 42');
  });
});

describe('tapeDeleteBlockers', () => {
  it('returns [] for no / nullish dependencies', () => {
    expect(tapeDeleteBlockers([])).toEqual([]);
    expect(tapeDeleteBlockers(null)).toEqual([]);
    expect(tapeDeleteBlockers(undefined)).toEqual([]);
  });

  it('maps dependency rows to "label (count)" strings', () => {
    const deps = [
      { key: 'electrode_cut_batches', label: 'партии электродов', count: 2 },
      { key: 'battery_electrodes', label: 'аккумуляторы', count: 1 },
    ];
    expect(tapeDeleteBlockers(deps)).toEqual(['партии электродов (2)', 'аккумуляторы (1)']);
  });

  it('falls back to the bare label when count is absent', () => {
    expect(tapeDeleteBlockers([{ label: 'связанные записи' }])).toEqual(['связанные записи']);
  });
});
