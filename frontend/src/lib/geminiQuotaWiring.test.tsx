import { render, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { translateVideo } from '../api/client';
import {
  fetchAndTranslateWattpadPart,
  fetchTranslateNext,
  retryNotebook,
  translateChapter,
} from '../api/novels';
import { analyzeProfile } from '../api/promptProfiles';
import PublicApp from '../PublicApp';
import { fakeFetch } from '../test/fakeFetch';
import { chapterDetail, chapterSummary, novelDetail } from '../test/novelFixtures';
import { forgetShownQuotaToasts } from './geminiQuota';
import { useChapterPolling } from './useChapterPolling';
import { useNovelPolling } from './useNovelPolling';
import { useTranslationPolling } from './useTranslationPolling';

const QUOTA = '/api/gemini/quota';
const NO_QUOTA = { exhausted: [], nowUsing: 'm' };

const quotaCalls = (calls: { path: string }[]) => calls.filter((c) => c.path === QUOTA).length;

beforeEach(() => forgetShownQuotaToasts());
afterEach(() => vi.useRealTimers());

describe('the six translate-start API functions check the quota once, after their own request', () => {
  const cases: [string, () => Promise<unknown>, string, string][] = [
    ['translateChapter', () => translateChapter(5), 'POST', '/api/chapters/5/translate'],
    ['fetchAndTranslateWattpadPart', () => fetchAndTranslateWattpadPart(3, '77'), 'POST', '/api/novels/3/wattpad/parts/77/fetch-translate'],
    ['fetchTranslateNext', () => fetchTranslateNext(3), 'POST', '/api/novels/3/wattpad/next/fetch-translate'],
    ['retryNotebook', () => retryNotebook(3), 'POST', '/api/novels/3/notebook/retry'],
    ['translateVideo', () => translateVideo('abcdefghijk', 'Moonshadow'), 'POST', '/api/videos/abcdefghijk/translate'],
    ['analyzeProfile', () => analyzeProfile('Moonshadow'), 'POST', '/api/prompt-profiles/Moonshadow/analyze'],
  ];

  it.each(cases)('%s on success', async (_name, call, method, path) => {
    const calls = fakeFetch([
      { method, path, status: 200, body: {} },
      { method: 'GET', path: QUOTA, status: 200, body: NO_QUOTA },
    ]);

    await call();
    await vi.waitFor(() => expect(quotaCalls(calls)).toBe(1));

    expect(calls[0].path).toBe(path); // after its own request, not before
  });

  it.each(cases)('%s on error', async (_name, call, method, path) => {
    const calls = fakeFetch([
      { method, path, status: 500, body: {} },
      { method: 'GET', path: QUOTA, status: 200, body: NO_QUOTA },
    ]);

    await expect(call()).rejects.toThrow();
    await vi.waitFor(() => expect(quotaCalls(calls)).toBe(1));
    expect(calls[0].path).toBe(path);
  });
});

/** Answers GET paths from a queue per path (the last answer repeats). */
function sequence(answers: Record<string, unknown[]>) {
  const calls: { path: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      calls.push({ path });
      const queue = answers[path] ?? [];
      const body = queue.length > 1 ? queue.shift() : queue[0];
      if (body === undefined) return new Response('{}', { status: 404 });
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
  return calls;
}

describe('polling hooks check the quota when the model changes or the run fails', () => {
  it('useChapterPolling', async () => {
    vi.useFakeTimers();
    const calls = sequence({
      '/api/chapters/9': [
        chapterDetail({ translationStatus: 'TRANSLATING', translationModel: 'a' }),
        chapterDetail({ translationStatus: 'TRANSLATING', translationModel: 'a' }),
        chapterDetail({ translationStatus: 'TRANSLATING', translationModel: 'a, b' }),
        chapterDetail({ translationStatus: 'TRANSLATING', translationModel: 'a, b' }),
        chapterDetail({ translationStatus: 'FAILED', translationModel: 'a, b' }),
      ],
      [QUOTA]: [NO_QUOTA],
    });
    renderHook(() => useChapterPolling(9, () => {}));

    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(3000);
    expect(quotaCalls(calls)).toBe(0); // baseline, then unchanged
    await vi.advanceTimersByTimeAsync(3000);
    expect(quotaCalls(calls)).toBe(1); // model changed
    await vi.advanceTimersByTimeAsync(3000);
    expect(quotaCalls(calls)).toBe(1); // unchanged
    await vi.advanceTimersByTimeAsync(3000);
    expect(quotaCalls(calls)).toBe(2); // failed
  });

  it('useNovelPolling', async () => {
    vi.useFakeTimers();
    const translating = (model: string) => [
      chapterSummary({ id: 10, translationStatus: 'TRANSLATING', translationModel: model }),
    ];
    const calls = sequence({
      '/api/novels/3': [
        novelDetail({ chapters: translating('a') }),
        novelDetail({ chapters: translating('a') }),
        novelDetail({ chapters: translating('b') }),
      ],
      [QUOTA]: [NO_QUOTA],
    });
    renderHook(() => useNovelPolling(3, true, () => {}));

    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(3000);
    expect(quotaCalls(calls)).toBe(0);
    await vi.advanceTimersByTimeAsync(3000);
    expect(quotaCalls(calls)).toBe(1);
  });

  it('useTranslationPolling', async () => {
    vi.useFakeTimers();
    const video = (model: string, status: string) => ({ id: 'abcdefghijk', translationModel: model, translationStatus: status });
    const calls = sequence({
      '/api/videos/abcdefghijk': [video('a', 'TRANSLATING'), video('a', 'TRANSLATING'), video('b', 'TRANSLATING')],
      [QUOTA]: [NO_QUOTA],
    });
    renderHook(() => useTranslationPolling(['abcdefghijk'], () => {}, () => {}));

    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(3000);
    expect(quotaCalls(calls)).toBe(0);
    await vi.advanceTimersByTimeAsync(3000);
    expect(quotaCalls(calls)).toBe(1);
  });
});

describe('no periodic quota requests', () => {
  it('the admin App asks nothing about quota in 5 minutes when nothing is translating', async () => {
    vi.useFakeTimers();
    const calls = fakeFetch([]);
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(quotaCalls(calls)).toBe(0);
  });

  it('PublicApp never requests it', async () => {
    const paths: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        paths.push(String(input));
        return new Response('Not found', { status: 404 });
      }),
    );
    render(
      <MemoryRouter initialEntries={['/vietsub/list']}>
        <PublicApp />
      </MemoryRouter>,
    );
    await vi.waitFor(() => expect(paths.length).toBeGreaterThan(0));

    expect(paths).not.toContain(QUOTA);
  });
});
