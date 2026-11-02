import type { ViCue } from '../api/client';

/**
 * Returns the cue shown at `ms` (start inclusive, end exclusive), or null.
 * `cues` must be sorted by startMs. When cues overlap, the latest-starting one wins.
 */
export function findActiveCue(cues: ViCue[], ms: number): ViCue | null {
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
    if (ms < cues[i].endMs) return cues[i];
  }
  return null;
}
