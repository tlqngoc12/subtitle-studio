import { vi } from 'vitest';
import { ApiError } from '../api/client';
import type { Site } from '../data/SiteContext';
import type { ReadSource } from '../data/types';

const notFound = (code: string) => () => Promise.reject(new ApiError(404, code, 'not found'));

/** A ReadSource answering from the given functions; anything else is "not found". */
export function fakeSource(overrides: Partial<ReadSource>): ReadSource {
  return {
    listVideos: async () => [],
    getVideo: notFound('VIDEO_NOT_FOUND'),
    getVietsub: notFound('VIDEO_NOT_FOUND'),
    listPlaylists: async () => [],
    getPlaylist: notFound('PLAYLIST_NOT_FOUND'),
    getProfilePage: notFound('PROFILE_NOT_FOUND'),
    listPhotos: async () => [],
    listFanfics: async () => [],
    listWorks: async () => [],
    getWork: notFound('WORK_NOT_FOUND'),
    ...overrides,
  };
}

/** The public site around `source`; also makes any real fetch fail the test, since static pages must not call /api. */
export function publicSite(source: ReadSource): Site {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      throw new Error(`Unexpected fetch ${String(input)}`);
    }),
  );
  return { source, readOnly: true, homePath: '/vietsub/list' };
}
