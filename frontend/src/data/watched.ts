import { useSyncExternalStore } from 'react';

/**
 * Which videos this browser has watched (a video counts once it ended or passed 90% of its length). Kept in
 * localStorage, like `novelReads.ts`; a blocked or full storage never breaks the page, the set then lives in
 * memory until the tab is closed. Runs in the admin app and on the public site alike (nothing is sent anywhere).
 */

const KEY = 'subtitle-studio.watched';
const MAX = 2000;

export const WATCHED_RATIO = 0.9;

/** True when the video has ended, or has been played up to 90% of its (known) duration. */
export function countsAsWatched(p: { ended: boolean; currentMs: number; durationSec: number | null }): boolean {
  if (p.ended) return true;
  return p.durationSec !== null && p.durationSec > 0 && p.currentMs >= p.durationSec * 1000 * WATCHED_RATIO;
}

/**
 * Where "Continue" leads: the first unwatched video of the playlist, once the viewer has watched at least one
 * of its videos. Null before the first one (Play all covers that) and after the last.
 */
export function continueIndex(videos: { id: string }[], watched: ReadonlySet<string>): number | null {
  if (!videos.some((v) => watched.has(v.id))) return null;
  const i = videos.findIndex((v) => !watched.has(v.id));
  return i < 0 ? null : i;
}

let memory: ReadonlySet<string> = new Set();
/** Storage threw: the set lives in `memory` only. */
let broken = false;
let lastRaw: string | null | undefined;
let lastSet: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

function parse(raw: string | null): ReadonlySet<string> {
  if (!raw) return new Set();
  try {
    const body: unknown = JSON.parse(raw);
    return Array.isArray(body) ? new Set(body.filter((x): x is string => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

function snapshot(): ReadonlySet<string> {
  if (broken) return memory;
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    broken = true;
    return memory;
  }
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastSet = parse(raw);
  }
  return lastSet;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener); // another tab marked something
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

/** Remembers that the video has been watched. */
export function markWatched(id: string): void {
  const current = snapshot();
  if (current.has(id)) return;
  const next = new Set([...current, id].slice(-MAX));
  memory = next;
  if (!broken) {
    try {
      const raw = JSON.stringify([...next]);
      localStorage.setItem(KEY, raw);
      lastRaw = raw;
      lastSet = next;
    } catch {
      broken = true;
    }
  }
  listeners.forEach((l) => l());
}

/** Test hook: forget what is in memory, as a page reload does (storage itself is left alone). */
export function resetWatched(): void {
  memory = new Set();
  broken = false;
  lastRaw = undefined;
  lastSet = new Set();
  listeners.forEach((l) => l());
}

/** The ids watched so far; components re-render when one is added. */
export function useWatched(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
