import { describe, expect, it, vi } from 'vitest';
import { formatDay, formatDayRange } from './dates';

describe('dates', () => {
  it('formats a day without shifting it', () => {
    expect(formatDay('2026-11-09')).toBe('9 Nov 2026');
    expect(formatDay('2026-01-01')).toBe('1 Jan 2026');
    expect(formatDay('2026-12-31')).toBe('31 Dec 2026');
  });

  it('is independent of the time zone', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles');
    try {
      expect(formatDay('2026-11-09')).toBe('9 Nov 2026');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('formats ranges with an en dash and collapses a single day', () => {
    expect(formatDayRange('2026-10-31', '2026-11-01')).toBe('31 Oct 2026 – 1 Nov 2026');
    expect(formatDayRange('2026-10-31', null)).toBe('31 Oct 2026');
    expect(formatDayRange('2026-10-31', '2026-10-31')).toBe('31 Oct 2026');
  });
});
