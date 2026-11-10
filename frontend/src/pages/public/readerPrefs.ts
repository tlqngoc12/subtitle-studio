/**
 * Reader preferences of the public site, kept in this browser's localStorage. Every access is wrapped in try/catch
 * (private mode, blocked storage): reads then give the defaults and writes are silently skipped.
 */

function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function set(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage is blocked or full: the preference just is not remembered.
  }
}

function json(key: string): unknown {
  const raw = get(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** The chapter number a reader opened last in this novel, or null. */
export function readProgress(slug: string): number | null {
  const v = json(`novel-progress:${slug}`);
  const no = v && typeof v === 'object' ? (v as { chapterNo?: unknown }).chapterNo : null;
  return typeof no === 'number' && Number.isInteger(no) ? no : null;
}

/** The chapter numbers opened so far in this novel. */
export function readReadChapters(slug: string): number[] {
  const v = json(`novel-read:${slug}`);
  return Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number' && Number.isInteger(n)) : [];
}

/** Opening a chapter: it becomes the reading position and joins the read list. */
export function recordProgress(slug: string, chapterNo: number) {
  set(`novel-progress:${slug}`, JSON.stringify({ chapterNo }));
  const read = readReadChapters(slug);
  if (!read.includes(chapterNo)) set(`novel-read:${slug}`, JSON.stringify([...read, chapterNo]));
}

export type ReaderTheme = 'light' | 'sepia' | 'dark' | 'oled';
export const READER_THEMES: readonly ReaderTheme[] = ['light', 'sepia', 'dark', 'oled'];

/** The stored theme; else the legacy night switch (on -> dark, off -> light); else dark/sepia by the app theme. */
export function readTheme(): ReaderTheme {
  const stored = get('reader-theme');
  const found = READER_THEMES.find((t) => t === stored);
  if (found) return found;
  const night = get('reader-night');
  if (night === 'on') return 'dark';
  if (night === 'off') return 'light';
  return isDarkTheme() ? 'dark' : 'sepia';
}

export function saveTheme(theme: ReaderTheme) {
  set('reader-theme', theme);
}

export type ReaderSize = 0 | 1 | 2;

export function readSize(): ReaderSize {
  const raw = get('reader-size');
  return raw === '0' ? 0 : raw === '2' ? 2 : 1;
}

export function saveSize(size: ReaderSize) {
  set('reader-size', String(size));
}

/** Slugs on the reader's shelf, newest first. */
export function readShelf(): string[] {
  const v = json('novel-shelf');
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** Adds the novel to the shelf (front) or removes it; true when it is on the shelf afterwards. */
export function toggleShelf(slug: string): boolean {
  const shelf = readShelf();
  const on = !shelf.includes(slug);
  set('novel-shelf', JSON.stringify(on ? [slug, ...shelf] : shelf.filter((s) => s !== slug)));
  return on;
}

/** Same rule as the CSS tokens: `data-theme` forces a theme, otherwise the OS setting decides. */
export function isDarkTheme(): boolean {
  const forced = document.documentElement.getAttribute('data-theme');
  if (forced === 'dark') return true;
  if (forced === 'light') return false;
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  } catch {
    return false;
  }
}
