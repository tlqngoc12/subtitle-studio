import { describe, expect, it } from 'vitest';
import { formatDuration, formatTimecode } from './format';

describe('formatTimecode', () => {
  it.each([
    [0, '00:00:00,000'],
    [1_000, '00:00:01,000'],
    [3_723_456, '01:02:03,456'],
    [36_000_000, '10:00:00,000'],
  ])('%i ms -> %s (same format as the .srt file)', (ms, expected) => {
    expect(formatTimecode(ms)).toBe(expected);
  });
});

describe('formatDuration', () => {
  it.each([
    [59, '0:59'],
    [754, '12:34'],
    [3_600, '1:00:00'],
    [4_321, '1:12:01'],
  ])('%i s -> %s', (sec, expected) => {
    expect(formatDuration(sec)).toBe(expected);
  });

  it('returns null when duration is unknown (e.g. livestream)', () => {
    expect(formatDuration(null)).toBeNull();
  });
});
