import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { createNovelSource } from './novelSource';

afterEach(() => vi.unstubAllGlobals());

function serve(files: Record<string, unknown>, html: string[] = []) {
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (html.includes(path)) return new Response('<!doctype html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
    if (!(path in files)) return new Response('Not found', { status: 404 });
    return new Response(JSON.stringify(files[path]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('createNovelSource', () => {
  it('reads the list, a novel and a chapter from data/', async () => {
    const fetch = serve({
      '/data/novels.json': [{ slug: 'summer' }],
      '/data/novels/summer.json': { slug: 'summer', chapters: [] },
      '/data/novels/summer/2.json': { chapterNo: 2, images: ['/novels/summer/a-1.webp'] },
    });
    const source = createNovelSource();

    expect(await source.listNovels()).toEqual([{ slug: 'summer' }]);
    expect((await source.getNovel('summer')).slug).toBe('summer');
    expect((await source.getChapter('summer', 2)).images).toEqual(['/novels/summer/a-1.webp']);
    expect(fetch.mock.calls.map((c) => String(c[0]))).toContain('/data/novels/summer/2.json');
  });

  it('treats the SPA fallback page as a missing chapter', async () => {
    serve({}, ['/data/novels/summer/9.json']);

    await expect(createNovelSource().getChapter('summer', 9)).rejects.toMatchObject({
      status: 404,
      code: 'CHAPTER_NOT_FOUND',
    });
  });

  it('reports a missing novel with its code', async () => {
    serve({});

    const error = await createNovelSource().getNovel('nope').catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('NOVEL_NOT_FOUND');
  });
});
