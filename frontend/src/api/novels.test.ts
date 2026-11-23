import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeFetch } from '../test/fakeFetch';
import { chapterDetail, novelDetail } from '../test/novelFixtures';
import {
  addChapter,
  createNovel,
  deletePage,
  exportChapter,
  exportNovel,
  getNovelProfiles,
  publishChapter,
  reorderPages,
  rotatePage,
  rotatePages,
  translateChapter,
  updateChapter,
  uploadPages,
} from './novels';

afterEach(() => vi.unstubAllGlobals());

describe('novels API', () => {
  it('exportNovel reads the blob and the file name', async () => {
    const calls = fakeFetch([
      {
        method: 'GET',
        path: '/api/novels/3/export',
        status: 200,
        body: 'zip bytes',
        headers: { 'Content-Disposition': 'attachment; filename="summer-love-2026-11-18.zip"' },
      },
    ]);

    const { blob, fileName } = await exportNovel(3);

    expect(fileName).toBe('summer-love-2026-11-18.zip');
    expect(blob.size).toBeGreaterThan(0);
    expect(calls[0].path).toBe('/api/novels/3/export');
  });

  it('exportNovel falls back to novel-<id>.zip without a header', async () => {
    fakeFetch([{ method: 'GET', path: '/api/novels/3/export', status: 200, body: 'x' }]);

    expect((await exportNovel(3)).fileName).toBe('novel-3.zip');
  });

  it('exportChapter reads the blob and the file name, falling back to chapter-<id>.zip', async () => {
    const calls = fakeFetch([
      {
        method: 'GET',
        path: '/api/chapters/7/export',
        status: 200,
        body: 'zip bytes',
        headers: { 'Content-Disposition': 'attachment; filename="s-chapter-7-2026-11-23.zip"' },
      },
    ]);
    expect((await exportChapter(7)).fileName).toBe('s-chapter-7-2026-11-23.zip');
    expect(calls[0].path).toBe('/api/chapters/7/export');

    fakeFetch([{ method: 'GET', path: '/api/chapters/7/export', status: 200, body: 'x' }]);
    expect((await exportChapter(7)).fileName).toBe('chapter-7.zip');
  });

  it('uploads several screenshots as "files" form fields', async () => {
    const calls = fakeFetch([{ method: 'POST', path: '/api/chapters/7/pages', status: 201, body: [] }]);
    const a = new File(['a'], 'p1.png', { type: 'image/png' });
    const b = new File(['b'], 'p2.png', { type: 'image/png' });

    await uploadPages(7, [a, b]);

    const body = calls[0].body as FormData;
    expect(body.getAll('files')).toHaveLength(2);
    expect((body.getAll('files')[1] as File).name).toBe('p2.png');
  });

  it('sends the new page order', async () => {
    const calls = fakeFetch([{ method: 'PUT', path: '/api/chapters/7/pages/order', status: 200, body: [] }]);

    await reorderPages(7, [3, 1, 2]);

    expect(JSON.parse(calls[0].body as string)).toEqual({ pageIds: [3, 1, 2] });
  });

  it('posts chapter actions', async () => {
    const calls = fakeFetch([
      { method: 'POST', path: '/api/novels/3/chapters', status: 201, body: chapterDetail() },
      { method: 'POST', path: '/api/chapters/9/translate', status: 202, body: chapterDetail() },
      { method: 'POST', path: '/api/chapters/9/publish', status: 200, body: chapterDetail() },
      { method: 'PUT', path: '/api/chapters/9', status: 200, body: chapterDetail() },
      { method: 'DELETE', path: '/api/chapters/9/pages/11', status: 204 },
    ]);

    await addChapter(3, { title: 'Mở đầu' });
    await translateChapter(9);
    await publishChapter(9);
    await updateChapter(9, { pages: [{ id: 11, textVi: 'Chào' }] });
    await deletePage(9, 11);

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'POST /api/novels/3/chapters',
      'POST /api/chapters/9/translate',
      'GET /api/gemini/quota', // after each translate start
      'POST /api/chapters/9/publish',
      'PUT /api/chapters/9',
      'DELETE /api/chapters/9/pages/11',
    ]);
    expect(JSON.parse(calls[0].body as string)).toEqual({ title: 'Mở đầu' });
    expect(JSON.parse(calls[4].body as string)).toEqual({ pages: [{ id: 11, textVi: 'Chào' }] });
  });

  it('creates an original story with its kind and no source fields', async () => {
    const calls = fakeFetch([
      { method: 'POST', path: '/api/novels', status: 201, body: novelDetail({ sourceType: 'ORIGINAL', sourceLanguage: 'vi' }) },
    ]);

    const created = await createNovel({
      slug: 'my-story',
      title: 'My story',
      coverMediaId: null,
      originalAuthor: 'EmiBonnie',
      description: null,
      tags: [],
      novelStatus: 'ONGOING',
      translatorCredit: null,
      sourceUrl: null,
      promptProfile: null,
      trailerUrl: null,
      sourceType: 'ORIGINAL',
    });

    expect(created.sourceType).toBe('ORIGINAL');
    expect(JSON.parse(calls[0].body as string)).toMatchObject({ sourceType: 'ORIGINAL', originalAuthor: 'EmiBonnie' });
  });

  it('adds an empty chapter to a novel with no body fields', async () => {
    const calls = fakeFetch([{ method: 'POST', path: '/api/novels/3/chapters', status: 201, body: chapterDetail() }]);

    await addChapter(3, {});

    expect(calls[0].path).toBe('/api/novels/3/chapters');
    expect(JSON.parse(calls[0].body as string)).toEqual({});
  });

  it('lists novel profiles from their own endpoint', async () => {
    fakeFetch([{ method: 'GET', path: '/api/novel-profiles', status: 200, body: { configured: true, profiles: ['BeMySugar'] } }]);

    expect((await getNovelProfiles()).profiles).toEqual(['BeMySugar']);
  });

  it('fixtures match the backend shape', () => {
    expect(novelDetail().chapters[0].publishStatus).toBe('PUBLISHED');
  });

  it('rotates one page or all pages', async () => {
    const calls = fakeFetch([
      { method: 'POST', path: '/api/chapters/1/pages/5/rotate', status: 200, body: [] },
      { method: 'POST', path: '/api/chapters/1/pages/rotate', status: 200, body: [] },
    ]);

    await rotatePage(1, 5, 'RIGHT');
    await rotatePages(1, 'LEFT');

    expect(calls[0].path).toBe('/api/chapters/1/pages/5/rotate');
    expect(JSON.parse(calls[0].body as string)).toEqual({ direction: 'RIGHT' });
    expect(calls[1].path).toBe('/api/chapters/1/pages/rotate');
    expect(JSON.parse(calls[1].body as string)).toEqual({ direction: 'LEFT' });
  });
});
