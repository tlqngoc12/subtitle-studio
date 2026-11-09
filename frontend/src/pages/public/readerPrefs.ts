/**
 * Reader preferences of the public site, kept in this browser's localStorage. Every access is wrapped in try/catch
 * (private mode, blocked storage): reads then give the defaults and writes are silently skipped.
 */

export const READER_WIDTHS = [600, 760, 900] as const;
export type ReaderWidth = (typeof READER_WIDTHS)[number];

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

/** The reader's own night-mode choice, or null when they never chose. */
export function readNight(): boolean | null {
  const v = get('reader-night');
  return v === 'on' ? true : v === 'off' ? false : null;
}

export function saveNight(on: boolean) {
  set('reader-night', on ? 'on' : 'off');
}

export function readWidth(): ReaderWidth {
  const n = Number(get('reader-width'));
  return READER_WIDTHS.find((w) => w === n) ?? READER_WIDTHS[0];
}

export function saveWidth(width: ReaderWidth) {
  set('reader-width', String(width));
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
