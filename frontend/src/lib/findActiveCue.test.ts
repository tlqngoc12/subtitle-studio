import { describe, expect, it } from 'vitest';
import type { ViCue } from '../api/client';
import { findActiveCue, findActiveIndex, findScrollTarget } from './findActiveCue';

const cues: ViCue[] = [
  { startMs: 0, endMs: 1_000, text: 'a' },
  { startMs: 1_000, endMs: 2_000, text: 'b' },
  { startMs: 3_000, endMs: 4_000, text: 'c' },
];

describe('findActiveCue', () => {
  it('returns the cue containing the time', () => {
    expect(findActiveCue(cues, 1_500)?.text).toBe('b');
  });

  it('treats start as inclusive and end as exclusive', () => {
    expect(findActiveCue(cues, 1_000)?.text).toBe('b');
    expect(findActiveCue(cues, 999)?.text).toBe('a');
  });

  it('returns null in a gap, before the first and after the last cue', () => {
    expect(findActiveCue(cues, 2_500)).toBeNull();
    expect(findActiveCue(cues, -1)).toBeNull();
    expect(findActiveCue(cues, 4_000)).toBeNull();
  });

  it('prefers the latest-starting cue when cues overlap', () => {
    const overlapping = [...cues, { startMs: 3_500, endMs: 5_000, text: 'd' }];
    expect(findActiveCue(overlapping, 3_600)?.text).toBe('d');
    expect(findActiveCue(overlapping, 4_500)?.text).toBe('d');
  });

  it('finds an earlier long cue that still covers the time', () => {
    const long: ViCue[] = [
      { startMs: 0, endMs: 10_000, text: 'long' },
      { startMs: 2_000, endMs: 3_000, text: 'short' },
    ];
    expect(findActiveCue(long, 5_000)?.text).toBe('long');
  });

  it('returns null for an empty list', () => {
    expect(findActiveCue([], 0)).toBeNull();
  });
});

describe('findActiveIndex', () => {
  it('returns the index of the cue showing at the time, or -1', () => {
    expect(findActiveIndex(cues, 0)).toBe(0);
    expect(findActiveIndex(cues, 1_000)).toBe(1);
    expect(findActiveIndex(cues, 2_500)).toBe(-1);
    expect(findActiveIndex(cues, 3_999)).toBe(2);
    expect(findActiveIndex(cues, 4_000)).toBe(-1);
    expect(findActiveIndex([], 10)).toBe(-1);
  });
});

describe('findScrollTarget', () => {
  const lines = [
    { startMs: 1_000, endMs: 2_000 },
    { startMs: 3_000, endMs: 4_000 },
    { startMs: 3_500, endMs: 6_000 },
  ];

  it('is -1 without cues', () => {
    expect(findScrollTarget([], 500)).toBe(-1);
  });

  it('is the active line when there is one', () => {
    expect(findScrollTarget(lines, 1_500)).toBe(0);
    expect(findScrollTarget(lines, 3_700)).toBe(2);
  });

  it('is the last line that started before a gap', () => {
    expect(findScrollTarget(lines, 2_500)).toBe(0);
    expect(findScrollTarget(lines, 9_000)).toBe(2);
  });

  it('is the first line before every line', () => {
    expect(findScrollTarget(lines, 0)).toBe(0);
  });
});
