// Unit tests for src/utils/tapePrint.js
//
// Pins the exact tape print-report URL so a filename/param typo can't silently
// break the report. Must match vanilla public/js/1-tapes.js getTapePrintReportUrl:
//   /workflow/tape-print.html?tape_id=<id>

import { describe, it, expect } from 'vitest';
import { tapePrintUrl } from '@/utils/tapePrint';

describe('tapePrintUrl', () => {
  it('builds the vanilla tape-print report URL', () => {
    expect(tapePrintUrl(7)).toBe('/workflow/tape-print.html?tape_id=7');
    expect(tapePrintUrl('42')).toBe('/workflow/tape-print.html?tape_id=42');
  });

  it('URL-encodes the id', () => {
    expect(tapePrintUrl('a b')).toBe('/workflow/tape-print.html?tape_id=a%20b');
  });
});
