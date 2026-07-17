import { describe, it, expect } from 'vitest';
import { parseBulkPaste } from '@/utils/electrodeBulkParse';

// cup_number was removed from the electrode UI on 2026-07-17 (deprecated
// in place; comments field replaces it). The parser no longer emits it:
// positional columns are [mass, comments], and a header-labelled cup
// column is recognised only so it can be ignored gracefully.

describe('parseBulkPaste — positional fallback', () => {
  it('returns empty for empty input', () => {
    expect(parseBulkPaste('').rows).toEqual([]);
    expect(parseBulkPaste(null).rows).toEqual([]);
  });

  it('parses single-column mass values', () => {
    const { rows } = parseBulkPaste('1.23\n2.45\n3.67');
    expect(rows).toEqual([
      { mass_g: 1.23, comments: '' },
      { mass_g: 2.45, comments: '' },
      { mass_g: 3.67, comments: '' },
    ]);
  });

  it('parses two columns as mass+comments', () => {
    const { rows } = parseBulkPaste('1.20\tпервая\n1.30\tвторая');
    expect(rows).toEqual([
      { mass_g: 1.20, comments: 'первая' },
      { mass_g: 1.30, comments: 'вторая' },
    ]);
  });

  it('joins extra columns into comments separated by " | "', () => {
    const { rows } = parseBulkPaste('1.20\tcomment1\textraA\textraB');
    expect(rows[0].comments).toBe('comment1 | extraA | extraB');
  });

  it('parses comma-decimal Russian numbers', () => {
    const { rows } = parseBulkPaste('1,20\tx\n2,55\ty');
    expect(rows[0].mass_g).toBe(1.20);
    expect(rows[1].mass_g).toBe(2.55);
  });

  it('skips rows with missing mass', () => {
    const { rows, skippedLines } = parseBulkPaste('1.0\ta\n\tb\nabc\tc\n2.0\td');
    expect(rows.length).toBe(2);
    expect(rows.map((r) => r.mass_g)).toEqual([1.0, 2.0]);
    expect(skippedLines).toBe(2);
  });
});

describe('parseBulkPaste — header detection', () => {
  it('detects header row with Russian keywords and ignores the cup column', () => {
    const text = 'Масса\tСтакан\tКомментарий\n1.20\t5\thello';
    const { rows, columnsDetected } = parseBulkPaste(text);
    expect(columnsDetected).toEqual(expect.arrayContaining(['mass', 'comments']));
    expect(columnsDetected).not.toContain('cup');
    // The cup value (5) is neither emitted nor leaked into comments.
    expect(rows[0]).toEqual({ mass_g: 1.20, comments: 'hello' });
  });

  it('detects header with English keywords and drops the cup value', () => {
    const text = 'Mass,Cup,Comment\n1.20,5,hi';
    const { rows } = parseBulkPaste(text);
    expect(rows[0]).toEqual({ mass_g: 1.20, comments: 'hi' });
  });

  it('handles reordered columns via header', () => {
    const text = 'Стакан\tКомментарий\tМасса\n9\tnote\t2.5';
    const { rows } = parseBulkPaste(text);
    expect(rows[0]).toEqual({ mass_g: 2.5, comments: 'note' });
  });

  it('falls back to positional if header has no mass keyword', () => {
    const text = 'foo\tbar\n1.20\tok';
    const { rows } = parseBulkPaste(text);
    // 'foo' is a string not parseable as number, so first line is skipped or treated as header.
    // Since header detection requires 'mass' keyword and none matches, falls back to positional.
    // First row "foo" fails mass parse, gets skipped. Second row 1.20\tok parses.
    expect(rows).toEqual([{ mass_g: 1.20, comments: 'ok' }]);
  });
});

describe('parseBulkPaste — separators', () => {
  it('handles tab-separated (Excel default)', () => {
    const { rows } = parseBulkPaste('1.0\tnote');
    expect(rows[0]).toEqual({ mass_g: 1.0, comments: 'note' });
  });

  it('handles comma-separated CSV', () => {
    const { rows } = parseBulkPaste('1.0,note');
    expect(rows[0]).toEqual({ mass_g: 1.0, comments: 'note' });
  });

  it('handles semicolon-separated (European locale)', () => {
    const { rows } = parseBulkPaste('1.0;note');
    expect(rows[0]).toEqual({ mass_g: 1.0, comments: 'note' });
  });

  it('trims whitespace from cells', () => {
    const { rows } = parseBulkPaste('  1.5  \t  note  ');
    expect(rows[0]).toEqual({ mass_g: 1.5, comments: 'note' });
  });
});
