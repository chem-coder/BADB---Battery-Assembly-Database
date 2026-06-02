import { describe, it, expect } from 'vitest';
import {
  isoDateToMskInput,
  formatDateTimeMsk,
  formatTimeMsk,
  todayIsoMsk,
} from '@/utils/dateFormat';

describe('isoDateToMskInput', () => {
  it('recovers the Moscow calendar day from an MSK-midnight ISO instant', () => {
    // Postgres DATE 2026-05-12 on an MSK server serialises to this UTC
    // instant. Naive slicing would give 2026-05-11 (a day early).
    expect(isoDateToMskInput('2026-05-11T21:00:00.000Z')).toBe('2026-05-12');
  });

  it('keeps a bare YYYY-MM-DD string as-is (no timezone ambiguity)', () => {
    expect(isoDateToMskInput('2026-05-12')).toBe('2026-05-12');
  });

  it('handles a UTC-midnight instant (server in UTC) as the same MSK day', () => {
    // 2026-05-12T00:00Z → 03:00 MSK → still 2026-05-12.
    expect(isoDateToMskInput('2026-05-12T00:00:00.000Z')).toBe('2026-05-12');
  });

  it('returns empty string for null / undefined / empty', () => {
    expect(isoDateToMskInput(null)).toBe('');
    expect(isoDateToMskInput(undefined)).toBe('');
    expect(isoDateToMskInput('')).toBe('');
  });

  it('falls back to the leading date for an unparseable but date-prefixed value', () => {
    expect(isoDateToMskInput('2026-05-12 garbage')).toBe('2026-05-12');
  });

  it('round-trips a year boundary correctly', () => {
    // DATE 2026-01-01 on MSK server → 2025-12-31T21:00Z. Must come back
    // as 2026-01-01, not 2025-12-31.
    expect(isoDateToMskInput('2025-12-31T21:00:00.000Z')).toBe('2026-01-01');
  });
});

describe('formatDateTimeMsk / formatTimeMsk include seconds', () => {
  it('formatDateTimeMsk renders HH:MM:SS', () => {
    // 2026-05-12T10:15:42Z → 13:15:42 MSK.
    const out = formatDateTimeMsk('2026-05-12T10:15:42.000Z');
    expect(out).toMatch(/13:15:42/);
    expect(out).toContain('12.05.2026');
  });

  it('formatTimeMsk renders HH:MM:SS', () => {
    expect(formatTimeMsk('2026-05-12T10:15:42.000Z')).toBe('13:15:42');
  });

  it('formatters return em-dash for empty input', () => {
    expect(formatDateTimeMsk(null)).toBe('—');
    expect(formatTimeMsk('')).toBe('—');
  });
});

describe('todayIsoMsk', () => {
  it('produces a YYYY-MM-DD string for a known instant', () => {
    // 2026-05-12T22:30Z → 01:30 MSK on 2026-05-13.
    expect(todayIsoMsk(new Date('2026-05-12T22:30:00.000Z'))).toBe('2026-05-13');
  });
});
