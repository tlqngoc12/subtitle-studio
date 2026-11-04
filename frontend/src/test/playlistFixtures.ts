import type { VideoDto } from '../api/client';
import type { PlaylistDetail, PlaylistSummary } from '../api/playlists';

export function vsVideo(id: string, title: string, channel = 'Dev Channel'): VideoDto {
  return {
    id,
    title,
    channel,
    durationSec: 754,
    subLang: 'en',
    subSource: 'MANUAL',
    cueCount: 10,
    fetchedAt: '2026-11-02T09:00:00Z',
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    viCueCount: 5,
    viUpdatedAt: '2026-11-02T10:00:00Z',
    viSource: 'MANUAL',
    translationStatus: null,
    translationError: null,
    translationProfile: null,
  };
}

export function summary(id: number, name: string, videoCount: number, extra: Partial<PlaylistSummary> = {}): PlaylistSummary {
  return {
    id,
    name,
    description: null,
    videoCount,
    thumbnailUrl: videoCount > 0 ? `https://i.ytimg.com/vi/COVER${id}/mqdefault.jpg` : null,
    updatedAt: '2026-11-04T10:00:00Z',
    ...extra,
  };
}

export function detail(id: number, name: string, videos: VideoDto[], description: string | null = null): PlaylistDetail {
  return { id, name, description, updatedAt: '2026-11-04T10:00:00Z', videos };
}
