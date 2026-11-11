import { describe, expect, it } from 'vitest';
import { fakeFetch } from '../test/fakeFetch';
import {
  addFanfic,
  deleteFanfic,
  listFanfics,
  previewFanfic,
  refreshAllFanfics,
  refreshFanfic,
} from './fanfics';

describe('fanfics api', () => {
  it('calls the six endpoints', async () => {
    const calls = fakeFetch([
      { method: 'GET', path: '/api/fanfics', status: 200, body: [] },
      { method: 'POST', path: '/api/fanfics/preview', status: 200, body: { id: null } },
      { method: 'POST', path: '/api/fanfics', status: 201, body: { id: 1 } },
      { method: 'POST', path: '/api/fanfics/1/refresh', status: 200, body: { id: 1 } },
      { method: 'POST', path: '/api/fanfics/refresh', status: 200, body: { updated: 1, failed: [] } },
      { method: 'DELETE', path: '/api/fanfics/1', status: 204 },
    ]);

    await listFanfics();
    await previewFanfic('https://www.wattpad.com/story/1');
    await addFanfic('https://www.wattpad.com/story/1');
    await refreshFanfic(1);
    expect(await refreshAllFanfics()).toEqual({ updated: 1, failed: [] });
    await deleteFanfic(1);

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /api/fanfics',
      'POST /api/fanfics/preview',
      'POST /api/fanfics',
      'POST /api/fanfics/1/refresh',
      'POST /api/fanfics/refresh',
      'DELETE /api/fanfics/1',
    ]);
    expect(JSON.parse(String(calls[1].body))).toEqual({ url: 'https://www.wattpad.com/story/1' });
    expect(JSON.parse(String(calls[2].body))).toEqual({ url: 'https://www.wattpad.com/story/1' });
  });
});
