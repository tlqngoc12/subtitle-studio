import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { createStaticSource } from './staticSource';

const VIDEO = {
  id: 'abc', title: 'Us EP.5', channel: 'GMMTV', durationSec: 364,
  thumbnailUrl: 'https://i.ytimg.com/vi/abc/mqdefault.jpg', viCueCount: 2, viUpdatedAt: '2026-11-04T10:00:00Z', viSource: 'AUTO',
};

/** Serves `files` (path → JSON) and answers 404 for anything else; records the requested paths. */
function serve(files: Record<string, unknown>): string[] {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      calls.push(path);
      if (!(path in files)) return new Response('Not found', { status: 404 });
      return new Response(JSON.stringify(files[path]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('staticSource', () => {
  it('reads videos and playlists', async () => {
    serve({
      '/data/videos.json': [VIDEO],
      '/data/playlists.json': [{ id: 7, name: 'Us', description: null, videoCount: 1, thumbnailUrl: null, updatedAt: 'x' }],
      '/data/playlists/7.json': { id: 7, name: 'Us', description: null, updatedAt: 'x', videos: [VIDEO] },
    });
    const source = createStaticSource();

    expect(await source.listVideos()).toEqual([VIDEO]);
    expect((await source.listPlaylists())[0].name).toBe('Us');
    expect((await source.getPlaylist(7)).videos[0].id).toBe('abc');
  });

  it('loads the video file once for the video and its Vietsub', async () => {
    const calls = serve({ '/data/videos/abc.json': { video: VIDEO, vietsub: [{ startMs: 0, endMs: 900, text: 'Xin chào' }] } });
    const source = createStaticSource();

    const [video, cues] = await Promise.all([source.getVideo('abc'), source.getVietsub('abc')]);

    expect(video.title).toBe('Us EP.5');
    expect(cues).toEqual([{ startMs: 0, endMs: 900, text: 'Xin chào' }]);
    expect(calls.filter((c) => c === '/data/videos/abc.json')).toHaveLength(1);
  });

  it('staticSourceMapsMissingFilesToNotFoundCodes', async () => {
    serve({});
    const source = createStaticSource();

    for (const [call, code] of [
      [() => source.getVideo('nope'), 'VIDEO_NOT_FOUND'],
      [() => source.getPlaylist(9), 'PLAYLIST_NOT_FOUND'],
      [() => source.getProfilePage(), 'PROFILE_NOT_FOUND'],
    ] as const) {
      const error = await call().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe(code);
      expect((error as ApiError).status).toBe(404);
    }
  });

  it('treatsThePagesSpaFallbackAsNotFound', async () => {
    // Cloudflare Pages answers a missing file with index.html and status 200, not 404.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html><html></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })));
    const source = createStaticSource();

    for (const [call, code] of [
      [() => source.getVideo('removed'), 'VIDEO_NOT_FOUND'],
      [() => source.getPlaylist(9), 'PLAYLIST_NOT_FOUND'],
      [() => source.getProfilePage(), 'PROFILE_NOT_FOUND'],
    ] as const) {
      const error = await call().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe(code);
    }
  });

  it('reports a network failure as NETWORK', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));

    const error = await createStaticSource().listVideos().catch((e: unknown) => e);

    expect((error as ApiError).code).toBe('NETWORK');
  });

  it('reads the profile page', async () => {
    const page = {
      group: { slug: 'emibonnie', displayName: 'EmiBonnie', kind: 'GROUP' },
      members: [{ slug: 'emi', displayName: 'Emi', kind: 'MEMBER' }],
    };
    serve({ '/data/profiles.json': page });

    expect(await createStaticSource().getProfilePage()).toEqual(page);
  });

  it('reads photos', async () => {
    const photos = [{ id: 1, title: 'T', takenOn: '2026-11-09' }];
    serve({ '/data/photos.json': photos });

    expect(await createStaticSource().listPhotos()).toEqual(photos);
  });

  it('reads works and a work, mapping a missing file to WORK_NOT_FOUND', async () => {
    serve({ '/data/works.json': [{ id: 3, title: 'T' }], '/data/works/3.json': { id: 3, title: 'T' } });
    const source = createStaticSource();

    expect(await source.listWorks()).toEqual([{ id: 3, title: 'T' }]);
    expect((await source.getWork(3)).title).toBe('T');
    const error = await source.getWork(99).catch((e: unknown) => e);
    expect((error as ApiError).code).toBe('WORK_NOT_FOUND');
  });
});
