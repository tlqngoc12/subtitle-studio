import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCaptionSize,
  getTheater,
  resetViewerPrefs,
  setCaptionSize,
  setTheater,
} from './viewerPrefs';

describe('viewerPrefs', () => {
  beforeEach(() => {
    localStorage.clear();
    resetViewerPrefs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with theater off and caption size S (the size before this setting)', () => {
    expect(getTheater()).toBe(false);
    expect(getCaptionSize()).toBe('s');
  });

  it('remembers theater mode and caption size in localStorage', () => {
    setTheater(true);
    setCaptionSize('l');

    expect(localStorage.getItem('subtitle-studio.theater')).toBe('on');
    expect(localStorage.getItem('subtitle-studio.captionSize')).toBe('l');
    expect(getTheater()).toBe(true);
    expect(getCaptionSize()).toBe('l');
  });

  it('ignores a stored caption size it does not know', () => {
    localStorage.setItem('subtitle-studio.captionSize', 'xxl');

    expect(getCaptionSize()).toBe('s');
  });

  it('does not break when storage throws, and keeps the choice in memory', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(getTheater()).toBe(false);
    expect(() => setTheater(true)).not.toThrow();
    expect(() => setCaptionSize('l')).not.toThrow();

    expect(getTheater()).toBe(true);
    expect(getCaptionSize()).toBe('l');
  });
});
