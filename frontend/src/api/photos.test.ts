import { describe, expect, it } from 'vitest';
import { fakeFetch } from '../test/fakeFetch';
import { createPhoto, deletePhoto, listPhotos, updatePhoto, type PhotoPostInput } from './photos';

const INPUT: PhotoPostInput = {
  postUrl: 'https://www.instagram.com/p/AAA/',
  mediaId: 4,
  title: 'T',
  takenOn: '2026-11-09',
  source: 'FAN',
  photoCount: null,
  profiles: ['emi'],
};

describe('photos api', () => {
  it('calls the four endpoints', async () => {
    const calls = fakeFetch([
      { method: 'GET', path: '/api/photos', status: 200, body: [] },
      { method: 'POST', path: '/api/photos', status: 201, body: { id: 1 } },
      { method: 'PUT', path: '/api/photos/1', status: 200, body: { id: 1 } },
      { method: 'DELETE', path: '/api/photos/1', status: 204 },
    ]);

    await listPhotos();
    await createPhoto(INPUT);
    await updatePhoto(1, INPUT);
    await deletePhoto(1);

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /api/photos',
      'POST /api/photos',
      'PUT /api/photos/1',
      'DELETE /api/photos/1',
    ]);
    expect(JSON.parse(String(calls[1].body))).toEqual(INPUT);
  });
});
