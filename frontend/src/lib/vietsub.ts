type VietsubSource = 'AUTO' | 'MANUAL' | null;

/** AI (Gemini) Vietsub first, then manual; inside each group the most recently updated first. */
export function sortVietsub<T extends { viSource: VietsubSource; viUpdatedAt: string | null }>(videos: T[]): T[] {
  const rank = (v: T) => (v.viSource === 'AUTO' ? 0 : 1);
  return [...videos].sort(
    (a, b) => rank(a) - rank(b) || (b.viUpdatedAt ?? '').localeCompare(a.viUpdatedAt ?? ''),
  );
}

/** Videos that have Vietsub, in the order of `sortVietsub`. */
export function withVietsub<T extends { viCueCount: number; viSource: VietsubSource; viUpdatedAt: string | null }>(
  videos: T[],
): T[] {
  return sortVietsub(videos.filter((v) => v.viCueCount > 0));
}
