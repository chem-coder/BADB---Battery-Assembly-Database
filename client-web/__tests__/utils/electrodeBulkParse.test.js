import { describe, it, expect } from 'vitest';
import { parseBulkPaste } from '@/utils/electrodeBulkParse';

describe('parseBulkPaste — positional fallback', () => {
  it('returns empty for empty input', () => {
    expect(parseBulkPaste('').rows).toEqual([]);
    expect(parseBulkPaste(null).rows).toEqual([]);
  });

  it('parses single-column mass values', () => {
    const { rows } = parseBulkPaste('1.23\n2.45\n3.67');
    expect(rows).toEqual([
      { mass_g: 1.23, cup_number: null, comments: '' },
      { mass_g: 2.45, cup_number: null, comments: '' },
      { mass_g: 3.67, cup_number: null, comments: '' },
    ]);
  });

  it('parses two columns as mass+cup', () => {
    const { rows } = parseBulkPaste('1.20\t1\n1.30\t2');
    expect(rows).toEqual([
      { mass_g: 1.20, cup_number: 1, comments: '' },
      { mass_g: 1.30, cup_number: 2, comments: '' },
    ]);
  });

  it('parses three columns as mass+cup+comments', () => {
    const { rows } = parseBulkPaste('1.20\t1\tпервая\n1.30\t2\tвторая');
    expect(rows).toEqual([
      { mass_g: 1.20, cup_number: 1, comments: 'первая' },
      { mass_g: 1.30, cup_number: 2, comments: 'вторая' },
    ]);
  });

  it('joins extra columns into comments separated by " | "', () => {
    const { rows } = parseBulkPaste('1.20\t1\tcomment1\textraA\textraB');
    expect(rows[0].comments).toBe('comment1 | extraA | extraB');
  });

  it('parses comma-decimal Russian numbers', () => {
    const { rows } = parseBulkPaste('1,20\t1\n2,55\t2');
    expect(rows[0].mass_g).toBe(1.20);
    expect(rows[1].mass_g).toBe(2.55);
  });

  it('skips rows with missing mass', () => {
    const { rows, skippedLines } = parseBulkPaste('1.0\t1\n\t2\nabc\t3\n2.0\t4');
    expect(rows.length).toBe(2);
    expect(rows.map((r) => r.mass_g)).toEqual([1.0, 2.0]);
    expect(skippedLines).toBe(2);
  });
});

describe('parseBulkPaste — header detection', () => {
  it('detects header row with Russian keywords', () => {
    const text = 'Масса\tСтакан\tКомментарий\n1.20\t5\thello';
    const { rows, columnsDetected } = parseBulkPaste(text);
    expect(columnsDetected).toEqual(expect.arrayContaining(['mass', 'cup', 'comments']));
    expect(rows[0]).toEqual({ mass_g: 1.20, cup_number: 5, comments: 'hello' });
  });

  it('detects header with English keywords', () => {
    const text = 'Mass,Cup,Comment\n1.20,5,hi';
    const { rows } = parseBulkPaste(text);
    expect(rows[0]).toEqual({ mass_g: 1.20, cup_number: 5, comments: 'hi' });
  });

  it('handles reordered columns via header', () => {
    const text = 'Стакан\tКомментарий\tМасса\n9\tnote\t2.5';
    const { rows } = parseBulkPaste(text);
    expect(rows[0]).toEqual({ mass_g: 2.5, cup_number: 9, comments: 'note' });
  });

  it('falls back to positional if header has no mass keyword', () => {
    const text = 'foo\tbar\n1.20\t3';
    const { rows } = parseBulkPaste(text);
    // 'foo' is a string not parseable as number, so first line is skipped or treated as header.
    // Since header detection requires 'mass' keyword and none matches, falls back to positional.
    // First row "foo" fails mass parse, gets skipped. Second row 1.20\t3 parses.
    expect(rows).toEqual([{ mass_g: 1.20, cup_number: 3, comments: '' }]);
  });
});

describe('parseBulkPaste — separators', () => {
  it('handles tab-separated (Excel default)', () => {
    const { rows } = parseBulkPaste('1.0\t2');
    expect(rows[0]).toEqual({ mass_g: 1.0, cup_number: 2, comments: '' });
  });

  it('handles comma-separated CSV', () => {
    const { rows } = parseBulkPaste('1.0,2');
    expect(rows[0]).toEqual({ mass_g: 1.0, cup_number: 2, comments: '' });
  });

  it('handles semicolon-separated (European locale)', () => {
    const { rows } = parseBulkPaste('1.0;2');
    expect(rows[0]).toEqual({ mass_g: 1.0, cup_number: 2, comments: '' });
  });

  it('trims whitespace from cells', () => {
    const { rows } = parseBulkPaste('  1.5  \t  3  ');
    expect(rows[0]).toEqual({ mass_g: 1.5, cup_number: 3, comments: '' });
  });
});
