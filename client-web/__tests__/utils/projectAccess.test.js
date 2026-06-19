// Unit tests for src/utils/projectAccess.js
//
// Project access (confidentiality) vocabulary. Matches vanilla
// public/js/projects.js: only `public` (открытый) and `confidential`
// (ограниченный) are selectable; legacy `department` is treated as ограниченный
// and is NOT offered as a new choice. Labels are lowercase to match the app's
// option-label convention.

import { describe, it, expect } from 'vitest';
import { ACCESS_OPTIONS, accessLabel, normalizeAccess } from '@/utils/projectAccess';

describe('ACCESS_OPTIONS', () => {
  it('offers exactly public + confidential (department dropped)', () => {
    expect(ACCESS_OPTIONS.map((o) => o.value)).toEqual(['public', 'confidential']);
  });
  it('uses the lowercase открытый / ограниченный labels', () => {
    expect(ACCESS_OPTIONS).toEqual([
      { value: 'public', label: 'открытый' },
      { value: 'confidential', label: 'ограниченный' },
    ]);
  });
});

describe('accessLabel', () => {
  it('maps public → открытый, confidential → ограниченный', () => {
    expect(accessLabel('public')).toBe('открытый');
    expect(accessLabel('confidential')).toBe('ограниченный');
  });
  it('maps legacy department → ограниченный (no longer a separate label)', () => {
    expect(accessLabel('department')).toBe('ограниченный');
  });
  it('falls back to открытый for blank/unknown', () => {
    expect(accessLabel('')).toBe('открытый');
    expect(accessLabel(null)).toBe('открытый');
    expect(accessLabel('weird')).toBe('weird');
  });
});

describe('normalizeAccess', () => {
  it('normalizes legacy department → confidential (so it groups under ограниченный)', () => {
    expect(normalizeAccess('department')).toBe('confidential');
  });
  it('leaves public and confidential unchanged', () => {
    expect(normalizeAccess('public')).toBe('public');
    expect(normalizeAccess('confidential')).toBe('confidential');
  });
});
