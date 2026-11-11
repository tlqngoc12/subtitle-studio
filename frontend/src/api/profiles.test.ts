import { describe, expect, it } from 'vitest';
import { fakeFetch } from '../test/fakeFetch';
import { reorderMembers, uploadMedia } from './profiles';

describe('profiles api', () => {
  it('uploadMedia appends maxSide only when given', async () => {
    const media = { id: 1, url: '/api/media/1', width: null, height: null };
    const calls = fakeFetch([
      { method: 'POST', path: '/api/media', status: 201, body: media },
      { method: 'POST', path: '/api/media?maxSide=1600', status: 201, body: { ...media, width: 1600, height: 900 } },
    ]);
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    await uploadMedia(file);
    const resized = await uploadMedia(file, 1600);

    expect(calls.map((c) => c.path)).toEqual(['/api/media', '/api/media?maxSide=1600']);
    expect(resized.width).toBe(1600);
  });

  it('reorderMembers sends the slugs with PUT /api/profiles/order', async () => {
    const calls = fakeFetch([{ method: 'PUT', path: '/api/profiles/order', status: 200, body: [] }]);

    await reorderMembers(['bonnie', 'emi']);

    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0].body))).toEqual({ slugs: ['bonnie', 'emi'] });
  });
});
