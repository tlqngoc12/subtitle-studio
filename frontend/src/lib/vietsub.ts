/** Videos that have Vietsub, most recently updated first. */
export function withVietsub<T extends { viCueCount: number; viUpdatedAt: string | null }>(videos: T[]): T[] {
  return videos
    .filter((v) => v.viCueCount > 0)
    .sort((a, b) => (b.viUpdatedAt ?? '').localeCompare(a.viUpdatedAt ?? ''));
}
