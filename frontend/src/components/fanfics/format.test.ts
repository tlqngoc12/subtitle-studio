import { describe, expect, it } from 'vitest';
import { formatCompact, formatReadingTime } from './format';

describe('formatCompact', () => {
  it.each([
    [51029, '51K'],
    [2167, '2.1K'],
    [999, '999'],
    [1000, '1K'],
    [1999, '1.9K'],
    [28, '28'],
    [0, '0'],
    [12345678, '12.3M'],
    [1_000_000, '1M'],
    [999_999, '999.9K'],
    [2_500_000_000, '2.5B'],
  ])('%i is %s (truncated like Wattpad, never rounded up)', (n, text) => {
    expect(formatCompact(n)).toBe(text);
  });

  it('never prints NaN for odd input', () => {
    expect(formatCompact(Number.NaN)).toBe('0');
    expect(formatCompact(-5)).toBe('0');
    expect(formatCompact(Number.POSITIVE_INFINITY)).toBe('0');
  });
});

describe('formatReadingTime', () => {
  it.each([
    [68, '1h 8m'],
    [45, '45m'],
    [60, '1h'],
    [125, '2h 5m'],
    [1, '1m'],
    [0, '—'],
    [-3, '—'],
    [Number.NaN, '—'],
  ])('%d minutes is %s', (minutes, text) => {
    expect(formatReadingTime(minutes)).toBe(text);
  });
});
