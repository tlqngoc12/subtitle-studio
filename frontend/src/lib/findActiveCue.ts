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
