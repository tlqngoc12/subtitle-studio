import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  READER_WIDTHS,
  isDarkTheme,
  readNight,
  readProgress,
  readReadChapters,
  readWidth,
  recordProgress,
  saveNight,
  saveWidth,
} from './readerPrefs';

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('data-theme');
});

describe('reading progress', () => {
  it('stores the chapter being read and the list of chapters opened', () => {
    recordProgress('summer', 3);
    recordProgress('summer', 4);
    recordProgress('summer', 3);

    expect(JSON.parse(localStorage.getItem('novel-progress:summer')!)).toEqual({ chapterNo: 3 });
    expect(JSON.parse(localStorage.getItem('novel-read:summer')!)).toEqual([3, 4]);
    expect(readProgress('summer')).toBe(3);
    expect(readReadChapters('summer')).toEqual([3, 4]);
  });

  it('keeps novels apart', () => {
    recordProgress('a', 1);

    expect(readProgress('b')).toBeNull();
    expect(readReadChapters('b')).toEqual([]);
  });

  it('ignores damaged stored values', () => {
    localStorage.setItem('novel-progress:summer', '{oops');
    localStorage.setItem('novel-read:summer', '"x"');

    expect(readProgress('summer')).toBeNull();
    expect(readReadChapters('summer')).toEqual([]);
  });

  it('works without storage: reads give defaults, writes do nothing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => recordProgress('summer', 3)).not.toThrow();
    expect(() => saveNight(true)).not.toThrow();
    expect(() => saveWidth(760)).not.toThrow();
    expect(readProgress('summer')).toBeNull();
    expect(readReadChapters('summer')).toEqual([]);
    expect(readNight()).toBeNull();
    expect(readWidth()).toBe(600);
  });
});

describe('night mode and width preferences', () => {
  it('stores the night choice as on/off', () => {
    expect(readNight()).toBeNull();
    saveNight(true);
    expect(localStorage.getItem('reader-night')).toBe('on');
    expect(readNight()).toBe(true);
    saveNight(false);
    expect(localStorage.getItem('reader-night')).toBe('off');
    expect(readNight()).toBe(false);
  });

  it('stores one of the three widths and defaults to 600', () => {
    expect(READER_WIDTHS).toEqual([600, 760, 900]);
    expect(readWidth()).toBe(600);
    saveWidth(900);
    expect(localStorage.getItem('reader-width')).toBe('900');
    expect(readWidth()).toBe(900);
    localStorage.setItem('reader-width', '123');
    expect(readWidth()).toBe(600);
  });

  it('follows the theme: data-theme wins, otherwise the OS setting', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(isDarkTheme()).toBe(true);
    document.documentElement.setAttribute('data-theme', 'light');
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(isDarkTheme()).toBe(false);
    document.documentElement.removeAttribute('data-theme');
    expect(isDarkTheme()).toBe(true);
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(isDarkTheme()).toBe(false);
    vi.unstubAllGlobals();
  });
});
