import type { ViCue } from '../api/client';

/**
 * Returns the index of the cue shown at `ms` (start inclusive, end exclusive), or -1.
 * `cues` must be sorted by startMs. When cues overlap, the latest-starting one wins.
 */
export function findActiveIndex(cues: readonly { startMs: number; endMs: number }[], ms: number): number {
  // Binary search: last index whose startMs <= ms.
  let lo = 0;
  let hi = cues.length - 1;
  let last = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].startMs <= ms) {
      last = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  // Walk back for an earlier, longer cue that still covers ms.
  for (let i = last; i >= 0; i--) {
    if (ms < cues[i].endMs) return i;
  }
  return -1;
}

/** The cue shown at `ms`, or null. See {@link findActiveIndex}. */
export function findActiveCue(cues: ViCue[], ms: number): ViCue | null {
  const i = findActiveIndex(cues, ms);
  return i < 0 ? null : cues[i];
}

/**
 * The index of the line a list should scroll to at `ms`: the line on screen, else the last line that started at or
 * before `ms` (the time is in a gap), else the first line. -1 only when there are no cues.
 */
export function findScrollTarget(cues: readonly { startMs: number; endMs: number }[], ms: number): number {
  if (cues.length === 0) return -1;
  const active = findActiveIndex(cues, ms);
  if (active >= 0) return active;
  let lo = 0;
  let hi = cues.length - 1;
  let last = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].startMs <= ms) {
      last = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return last;
}
