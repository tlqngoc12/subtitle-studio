import { describe, expect, it, vi } from 'vitest';
import { formatDay, formatInstant, formatInstantWithTime, parseDay } from './dates';

describe('dates', () => {
  it('formats a day as dd/MM/yyyy without shifting it', () => {
    expect(formatDay('2026-11-09')).toBe('09/11/2026');
    expect(formatDay('2026-01-01')).toBe('01/01/2026');
    expect(formatDay('2026-12-31')).toBe('31/12/2026');
  });

  it('formatDay is independent of the time zone', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles');
    try {
      expect(formatDay('2026-11-09')).toBe('09/11/2026');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('formats an instant in Vietnam time', () => {
    // 20:00 UTC on 9 Nov is already 10 Nov at 03:00 in Vietnam (UTC+7).
    expect(formatInstant('2026-11-09T20:00:00Z')).toBe('10/11/2026');
    expect(formatInstant('2026-11-09T10:00:00Z')).toBe('09/11/2026');
  });

  it('formats an instant with a 24-hour time', () => {
    expect(formatInstantWithTime('2026-11-09T20:05:00Z')).toBe('10/11/2026 03:05');
    expect(formatInstantWithTime('2026-11-09T07:30:00Z')).toBe('09/11/2026 14:30');
    expect(formatInstantWithTime('2026-11-09T17:00:00Z')).toBe('10/11/2026 00:00');
  });
});

describe('parseDay', () => {
  it.each([
    ['09/11/2026', '2026-11-09'],
    ['9/1/2026', '2026-01-09'],
    ['09-11-2026', '2026-11-09'],
    ['9.11.2026', '2026-11-09'],
    [' 29/02/2028 ', '2028-02-29'],
  ])('parses %s', (text, iso) => {
    expect(parseDay(text)).toBe(iso);
  });

  it.each(['', '31/02/2026', '29/02/2027', '32/01/2026', '1/13/2026', '0/1/2026', '2026-11-09', '9/11/26', 'abc'])(
    'rejects %j',
    (text) => {
      expect(parseDay(text)).toBeNull();
    },
  );
});
