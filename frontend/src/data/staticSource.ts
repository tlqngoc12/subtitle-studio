import { ApiError, type ViCue } from '../api/client';
import type { Profile, ProfileSummary } from '../api/profiles';
import type { PublicPlaylistDetail, PublicPlaylistSummary, PublicVideo, ReadSource } from './types';

interface VideoFile {
  video: PublicVideo;
  vietsub: ViCue[];
}

/**
 * The public site's data: JSON files written by Publish under `${base}data/`. A missing file answers like the
 * API would (404 with the matching code), so pages show the same "not found" messages.
 */
export function createStaticSource(base = '/'): ReadSource {
  const videoFiles = new Map<string, Promise<VideoFile>>();

  async function read<T>(path: string, notFoundCode: string | null = null): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${base}data/${path}`);
    } catch (e) {
      throw new ApiError(0, 'NETWORK', e instanceof Error ? e.message : String(e));
    }
    // Cloudflare Pages answers a missing file with the SPA's index.html (200, text/html): treat that as 404 too.
    const isJson = (res.headers.get('Content-Type') ?? '').includes('json');
    if (res.status === 404 || (res.ok && !isJson)) {
      throw new ApiError(404, notFoundCode, `Not found: ${path}`);
    }
    if (!res.ok) {
      throw new ApiError(res.status, null, `Could not load ${path}`);
    }
    return res.json() as Promise<T>;
  }

  function videoFile(id: string): Promise<VideoFile> {
    let file = videoFiles.get(id);
    if (!file) {
      file = read<VideoFile>(`videos/${encodeURIComponent(id)}.json`, 'VIDEO_NOT_FOUND');
      file.catch(() => videoFiles.delete(id)); // let a later visit try again
      videoFiles.set(id, file);
    }
    return file;
  }

  return {
    listVideos: () => read<PublicVideo[]>('videos.json'),
    getVideo: async (id) => (await videoFile(id)).video,
    getVietsub: async (id) => (await videoFile(id)).vietsub,
    listPlaylists: () => read<PublicPlaylistSummary[]>('playlists.json'),
    getPlaylist: (id) => read<PublicPlaylistDetail>(`playlists/${id}.json`, 'PLAYLIST_NOT_FOUND'),
    listProfiles: () => read<ProfileSummary[]>('profiles.json'),
    getProfile: (slug) => read<Profile>(`profiles/${encodeURIComponent(slug)}.json`, 'PROFILE_NOT_FOUND'),
  };
}
