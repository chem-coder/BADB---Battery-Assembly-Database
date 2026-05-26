// Unit tests for src/utils/formatDependency.js
//
// Pure function. Verifies formatting against the delete-check response
// shape from routes/recipes.js and the vanilla v1 formatting logic in
// public/js/recipes.js:435-455.

import { describe, it, expect } from 'vitest';
import { formatDependency } from '@/utils/formatDependency';

describe('formatDependency', () => {
  it('returns default message when input is empty', () => {
    expect(formatDependency({})).toBe('Нельзя удалить запись: есть связанные данные.');
  });

  it('returns default message when input is null/undefined', () => {
    expect(formatDependency(null)).toBe('Нельзя удалить запись: есть связанные данные.');
    expect(formatDependency(undefined)).toBe('Нельзя удалить запись: есть связанные данные.');
  });

  it('uses backend message when provided, no dependencies', () => {
    const out = formatDependency({ message: 'Нельзя удалить рецепт: используется в лентах.' });
    expect(out).toBe('Нельзя удалить рецепт: используется в лентах.');
  });

  it('appends dependency records when provided', () => {
    const out = formatDependency({
      message: 'Нельзя удалить: связаны записи.',
      dependencies: [
        { records: [{ id: 1, name: 'foo' }, { id: 2, name: 'bar' }] },
      ],
    });
    expect(out).toBe('Нельзя удалить: связаны записи. Сначала уберите связи: #1: foo, #2: bar.');
  });

  it('limits dependency records to 4 inline', () => {
    const out = formatDependency({
      message: 'X',
      dependencies: [
        { records: [
          { id: 1, name: 'a' },
          { id: 2, name: 'b' },
          { id: 3, name: 'c' },
          { id: 4, name: 'd' },
          { id: 5, name: 'e' },
        ] },
      ],
    });
    expect(out).toContain('#1: a, #2: b, #3: c, #4: d');
    expect(out).not.toContain('#5: e');
  });

  it('formats records without name as bare id', () => {
    const out = formatDependency({
      message: 'X',
      dependencies: [{ records: [{ id: 7 }, { id: 8, name: 'eight' }] }],
    });
    expect(out).toContain('#7, #8: eight');
  });

  it('flattens records across multiple dependency groups', () => {
    const out = formatDependency({
      message: 'X',
      dependencies: [
        { records: [{ id: 1, name: 'tape' }] },
        { records: [{ id: 2, name: 'electrode' }] },
      ],
    });
    expect(out).toBe('X Сначала уберите связи: #1: tape, #2: electrode.');
  });

  it('omits empty record arrays', () => {
    const out = formatDependency({
      message: 'X',
      dependencies: [{ records: [] }, { records: [{ id: 9, name: 'nine' }] }],
    });
    expect(out).toContain('#9: nine');
    expect(out).not.toContain('#:');
  });

  it('falls back to default when message is missing but dependencies present', () => {
    const out = formatDependency({
      dependencies: [{ records: [{ id: 1, name: 'one' }] }],
    });
    expect(out).toBe('Нельзя удалить запись: есть связанные данные. Сначала уберите связи: #1: one.');
  });
});
