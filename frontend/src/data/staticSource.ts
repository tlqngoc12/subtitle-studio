import { ApiError, type ViCue } from '../api/client';
import type { ProfilePage } from '../api/profiles';
import type { PublicPlaylistDetail, PublicPlaylistSummary, PublicVideo, ReadSource } from './types';

interface VideoFile {
  video: PublicVideo;
  vietsub: ViCue[];
}

/**
 * Reads `${base}data/${path}`. A missing file answers like the API would (404 with `notFoundCode`); so does the SPA
 * page Cloudflare Pages serves for a missing file (200, text/html).
 */
export async function readStaticJson<T>(base: string, path: string, notFoundCode: string | null = null): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base}data/${path}`);
  } catch (e) {
    throw new ApiError(0, 'NETWORK', e instanceof Error ? e.message : String(e));
  }
  const isJson = (res.headers.get('Content-Type') ?? '').includes('json');
  if (res.status === 404 || (res.ok && !isJson)) {
    throw new ApiError(404, notFoundCode, `Not found: ${path}`);
  }
  if (!res.ok) {
    throw new ApiError(res.status, null, `Could not load ${path}`);
  }
  return res.json() as Promise<T>;
}

/**
 * The public site's data: JSON files written by Publish under `${base}data/`. A missing file answers like the
 * API would (404 with the matching code), so pages show the same "not found" messages.
 */
export function createStaticSource(base = '/'): ReadSource {
  const videoFiles = new Map<string, Promise<VideoFile>>();

  const read = <T,>(path: string, notFoundCode: string | null = null) => readStaticJson<T>(base, path, notFoundCode);

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
    getProfilePage: () => read<ProfilePage>('profiles.json', 'PROFILE_NOT_FOUND'),
  };
}
