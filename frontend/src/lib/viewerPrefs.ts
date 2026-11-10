import { useSyncExternalStore } from 'react';

/**
 * The viewer's choices on the watch page: theater mode and caption size. Remembered in localStorage (same
 * try/catch pattern as `data/watched.ts`): when storage is blocked the choice lives in memory until the tab closes.
 * Used by the admin app and the public site alike; nothing is sent anywhere.
 */

const THEATER_KEY = 'subtitle-studio.theater';
const CAPTION_SIZE_KEY = 'subtitle-studio.captionSize';

export type CaptionSize = 's' | 'm' | 'l';

/** Factor applied to the caption size the player already computes. */
export const CAPTION_SCALE: Record<CaptionSize, number> = { s: 1, m: 1.25, l: 1.5 };

/** S is the size the captions had before this setting existed, so nothing changes until the viewer picks one. */
const DEFAULT_SIZE: CaptionSize = 's';

let memoryTheater = false;
let memorySize: CaptionSize = DEFAULT_SIZE;
const listeners = new Set<() => void>();

function readStorage(key: string): string | null | undefined {
  try {
    return localStorage.getItem(key);
  } catch {
    return undefined; // storage is blocked
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private window or blocked storage: the choice lasts until the page is closed
  }
}

function notify() {
  listeners.forEach((l) => l());
}

export function getTheater(): boolean {
  const raw = readStorage(THEATER_KEY);
  return raw === undefined ? memoryTheater : raw === 'on';
}

export function setTheater(on: boolean) {
  memoryTheater = on;
  writeStorage(THEATER_KEY, on ? 'on' : 'off');
  notify();
}

function isSize(value: unknown): value is CaptionSize {
  return value === 's' || value === 'm' || value === 'l';
}

export function getCaptionSize(): CaptionSize {
  const raw = readStorage(CAPTION_SIZE_KEY);
  if (raw === undefined) return memorySize;
  return isSize(raw) ? raw : DEFAULT_SIZE;
}

export function setCaptionSize(size: CaptionSize) {
  memorySize = size;
  writeStorage(CAPTION_SIZE_KEY, size);
  notify();
}

/** For tests: forget the in-memory fallbacks. */
export function resetViewerPrefs() {
  memoryTheater = false;
  memorySize = DEFAULT_SIZE;
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Theater mode on or off, and a function that flips it. */
export function useTheater(): [boolean, () => void] {
  const on = useSyncExternalStore(subscribe, getTheater, () => false);
  return [on, () => setTheater(!getTheater())];
}

/** The caption size and its setter; every component using it updates together. */
export function useCaptionSize(): [CaptionSize, (size: CaptionSize) => void] {
  const size = useSyncExternalStore(subscribe, getCaptionSize, () => DEFAULT_SIZE);
  return [size, setCaptionSize];
}
