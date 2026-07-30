// Unit tests for src/utils/selectOptions.js
//
// withStoredValueOption(options, value) appends a legacy stored value as an
// extra Select option (label = raw value + ' (как сохранено)') when it is not
// already in the option list, so legacy free-text DB values (e.g. separators'
// air_perm_units = 'с/100 мл') display and round-trip unchanged.

import { describe, it, expect } from 'vitest';
import { withStoredValueOption } from '@/utils/selectOptions';

const BASE = [
  { value: '', label: '— ед. изм. —' },
  { value: 'Gurley_s', label: 'Gurley, с' },
];

describe('withStoredValueOption', () => {
  it('returns options unchanged for empty/null value', () => {
    expect(withStoredValueOption(BASE, '')).toBe(BASE);
    expect(withStoredValueOption(BASE, null)).toBe(BASE);
    expect(withStoredValueOption(BASE, undefined)).toBe(BASE);
  });

  it('returns options unchanged when value is already an option', () => {
    expect(withStoredValueOption(BASE, 'Gurley_s')).toBe(BASE);
  });

  it('appends a labeled extra option for a legacy value', () => {
    const result = withStoredValueOption(BASE, 'с/100 мл');
    expect(result).toHaveLength(BASE.length + 1);
    expect(result[result.length - 1]).toEqual({
      value: 'с/100 мл',
      label: 'с/100 мл (как сохранено)',
    });
  });

  it('does not mutate the base option list', () => {
    const copy = BASE.map((o) => ({ ...o }));
    withStoredValueOption(BASE, 'legacy');
    expect(BASE).toEqual(copy);
  });
});
