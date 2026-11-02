import type { VideoDto } from '../api/client';

/** Videos that have Vietsub, most recently updated first. */
export function withVietsub(videos: VideoDto[]): VideoDto[] {
  return videos
    .filter((v) => v.viCueCount > 0)
    .sort((a, b) => (b.viUpdatedAt ?? '').localeCompare(a.viUpdatedAt ?? ''));
}
