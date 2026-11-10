import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  continueIndex,
  countsAsWatched,
  markWatched,
  resetWatched,
  useWatched,
  WATCHED_RATIO,
} from './watched';

describe('countsAsWatched', () => {
  it('is true once the video has ended', () => {
    expect(countsAsWatched({ ended: true, currentMs: 0, durationSec: 600 })).toBe(true);
    expect(countsAsWatched({ ended: true, currentMs: 0, durationSec: null })).toBe(true);
  });

  it('is true from 90% of the duration', () => {
    expect(WATCHED_RATIO).toBe(0.9);
    expect(countsAsWatched({ ended: false, currentMs: 539_000, durationSec: 600 })).toBe(false);
    expect(countsAsWatched({ ended: false, currentMs: 540_000, durationSec: 600 })).toBe(true);
  });

  it('is false at the start, and without a known duration', () => {
    expect(countsAsWatched({ ended: false, currentMs: 0, durationSec: 600 })).toBe(false);
    expect(countsAsWatched({ ended: false, currentMs: 999_999, durationSec: null })).toBe(false);
    expect(countsAsWatched({ ended: false, currentMs: 999_999, durationSec: 0 })).toBe(false);
  });
});

describe('continueIndex', () => {
  const vids = ['a', 'b', 'c', 'd'].map((id) => ({ id }));

  it('is the first unwatched video once something was watched', () => {
    expect(continueIndex(vids, new Set(['a', 'b']))).toBe(2);
    expect(continueIndex(vids, new Set(['a', 'c']))).toBe(1);
  });

  it('is null when nothing was watched yet (Play all covers it) or everything was', () => {
    expect(continueIndex(vids, new Set())).toBeNull();
    expect(continueIndex(vids, new Set(['a', 'b', 'c', 'd']))).toBeNull();
    expect(continueIndex([], new Set(['x']))).toBeNull();
  });

  it('ignores watched ids that are not in this playlist', () => {
    expect(continueIndex(vids, new Set(['zzz']))).toBeNull();
  });
});

describe('watched store', () => {
  beforeEach(() => {
    localStorage.clear();
    resetWatched();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('remembers watched ids across reloads (localStorage)', () => {
    markWatched('abc');
    resetWatched(); // like a page reload: memory gone, storage stays
    const { result } = renderHook(() => useWatched());
    expect(result.current.has('abc')).toBe(true);
  });

  it('updates mounted components when a video is marked', () => {
    const { result } = renderHook(() => useWatched());
    expect(result.current.has('abc')).toBe(false);
    act(() => markWatched('abc'));
    expect(result.current.has('abc')).toBe(true);
  });

  it('marking twice keeps one entry', () => {
    markWatched('abc');
    markWatched('abc');
    expect(JSON.parse(localStorage.getItem('subtitle-studio.watched')!)).toEqual(['abc']);
  });

  it('survives garbage in storage', () => {
    localStorage.setItem('subtitle-studio.watched', '{not json');
    const { result } = renderHook(() => useWatched());
    expect(result.current.size).toBe(0);
    localStorage.setItem('subtitle-studio.watched', '{"a":1}');
    resetWatched();
    expect(renderHook(() => useWatched()).result.current.size).toBe(0);
  });

  it('keeps working in memory when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useWatched());
    expect(result.current.size).toBe(0);
    expect(() => act(() => markWatched('abc'))).not.toThrow();
    expect(result.current.has('abc')).toBe(true);
  });

  it('keeps the set in memory when only writing fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const { result } = renderHook(() => useWatched());
    act(() => markWatched('abc'));
    expect(result.current.has('abc')).toBe(true);
  });
});
