import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isDarkTheme,
  readProgress,
  readReadChapters,
  readShelf,
  readSize,
  readTheme,
  recordProgress,
  toggleShelf,
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
    expect(readProgress('summer')).toBeNull();
    expect(readReadChapters('summer')).toEqual([]);
  });
});

describe('theme and OS preferences', () => {
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

describe('theme, size and shelf preferences', () => {
  it('readTheme migrates night on → dark, off → light', () => {
    localStorage.setItem('reader-night', 'on');
    expect(readTheme()).toBe('dark');
    localStorage.setItem('reader-night', 'off');
    expect(readTheme()).toBe('light');
  });

  it('readTheme defaults to sepia, or dark when the app theme is dark', () => {
    expect(readTheme()).toBe('sepia');
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(readTheme()).toBe('dark');
  });

  it('readTheme ignores an unknown stored value', () => {
    localStorage.setItem('reader-theme', 'neon');
    expect(readTheme()).toBe('sepia');
    localStorage.setItem('reader-theme', 'oled');
    expect(readTheme()).toBe('oled');
  });

  it('readSize defaults to 1 and ignores 7', () => {
    expect(readSize()).toBe(1);
    localStorage.setItem('reader-size', '7');
    expect(readSize()).toBe(1);
    localStorage.setItem('reader-size', '2');
    expect(readSize()).toBe(2);
  });

  it('toggleShelf adds then removes; newest first', () => {
    expect(toggleShelf('a')).toBe(true);
    expect(toggleShelf('b')).toBe(true);
    expect(readShelf()).toEqual(['b', 'a']);
    expect(toggleShelf('b')).toBe(false);
    expect(readShelf()).toEqual(['a']);
  });

  it('blocked storage: defaults and toggleShelf does not throw', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readTheme()).toBe('sepia');
    expect(readSize()).toBe(1);
    expect(readShelf()).toEqual([]);
    expect(() => toggleShelf('a')).not.toThrow();
  });
});
