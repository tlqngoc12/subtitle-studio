import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchReadCounts, formatReads, recordRead, resetReadCounts } from './novelReads';

const NOW = Date.parse('2026-11-10T10:00:00Z');
const flush = () => new Promise((r) => setTimeout(r, 0));
const ok = () => new Response(null, { status: 204 });

beforeEach(() => {
  localStorage.clear();
  resetReadCounts();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('formatReads', () => {
  it('shows small numbers whole and larger ones compact in vi-VN', () => {
    expect(formatReads(0)).toBe('0');
    expect(formatReads(999)).toBe('999');
    expect(formatReads(1234)).toBe('1,2 N');
    expect(formatReads(15600)).toBe('15,6 N');
  });
});

describe('recordRead', () => {
  it('posts the read once and remembers it for 24 hours', async () => {
    const fetch = vi.fn(async () => ok());
    vi.stubGlobal('fetch', fetch);

    recordRead('summer', 3, NOW);
    await flush();
    expect(fetch).toHaveBeenCalledWith('/api/reads/summer', expect.objectContaining({ method: 'POST' }));
    expect(localStorage.getItem('reads:summer:3')).toBe(String(NOW));

    recordRead('summer', 3, NOW + 23 * 3600_000);
    expect(fetch).toHaveBeenCalledTimes(1);

    recordRead('summer', 3, NOW + 25 * 3600_000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('counts another chapter of the same novel separately', () => {
    const fetch = vi.fn(async () => ok());
    vi.stubGlobal('fetch', fetch);

    recordRead('summer', 1, NOW);
    recordRead('summer', 2, NOW);

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('stays silent on a network error and does not remember a failed count', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline');
      }),
    );

    expect(() => recordRead('summer', 3, NOW)).not.toThrow();
    await flush();
    expect(localStorage.getItem('reads:summer:3')).toBeNull();
  });

  it('still counts when storage is blocked', () => {
    const fetch = vi.fn(async () => ok());
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => recordRead('summer', 3, NOW)).not.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('fetchReadCounts', () => {
  it('returns the counts and reuses them for a minute', async () => {
    const fetch = vi.fn(async () => new Response('{"summer":12}', { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);

    expect(await fetchReadCounts()).toEqual({ summer: 12 });
    expect(await fetchReadCounts()).toEqual({ summer: 12 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('is null on an error, on a non-JSON answer (SPA fallback) and on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 503 })));
    expect(await fetchReadCounts()).toBeNull();

    resetReadCounts();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } })),
    );
    expect(await fetchReadCounts()).toBeNull();

    resetReadCounts();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline');
      }),
    );
    expect(await fetchReadCounts()).toBeNull();
  });
});
