import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFetch } from '../test/fakeFetch';
import { formatInstantWithTime } from './dates';
import { afterTranslateStart, checkGeminiQuota, createQuotaWatcher, forgetShownQuotaToasts } from './geminiQuota';

vi.mock('sonner', () => ({ toast: { warning: vi.fn(), dismiss: vi.fn() } }));

const RESET = '2026-01-16T08:00:00Z';

function quota(body: unknown, status = 200) {
  return fakeFetch([{ method: 'GET', path: '/api/gemini/quota', status, body }]);
}

describe('checkGeminiQuota', () => {
  beforeEach(() => {
    vi.mocked(toast.warning).mockClear();
    forgetShownQuotaToasts();
  });

  it('toasts a daily entry once with the reset time and the model now used', async () => {
    quota({ exhausted: [{ model: 'gemini-a', kind: 'DAILY', resetAt: RESET }], nowUsing: 'gemini-b' });

    await checkGeminiQuota();
    await checkGeminiQuota();

    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.warning).toHaveBeenCalledWith('gemini-a is out of quota', {
      description: `Daily quota resets at ${formatInstantWithTime(RESET)} (Vietnam time). Now using gemini-b.`,
      duration: 10000,
    });
  });

  it('says no model is left when nowUsing is null', async () => {
    quota({ exhausted: [{ model: 'gemini-a', kind: 'DAILY', resetAt: RESET }], nowUsing: null });

    await checkGeminiQuota();

    expect(toast.warning).toHaveBeenCalledWith('gemini-a is out of quota', {
      description: `Daily quota resets at ${formatInstantWithTime(RESET)} (Vietnam time). No model left until then.`,
      duration: 10000,
    });
  });

  it('does not toast per-minute limits', async () => {
    quota({ exhausted: [{ model: 'gemini-a', kind: 'MINUTE', resetAt: RESET }], nowUsing: 'gemini-a' });

    await checkGeminiQuota();

    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('toasts a new reset time of the same model again', async () => {
    quota({ exhausted: [{ model: 'gemini-a', kind: 'DAILY', resetAt: RESET }], nowUsing: null });
    await checkGeminiQuota();
    quota({ exhausted: [{ model: 'gemini-a', kind: 'DAILY', resetAt: '2026-01-17T08:00:00Z' }], nowUsing: null });
    await checkGeminiQuota();

    expect(toast.warning).toHaveBeenCalledTimes(2);
  });

  it('shows nothing and does not throw when the request fails', async () => {
    quota({}, 500);
    await expect(checkGeminiQuota()).resolves.toBeUndefined();

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(checkGeminiQuota()).resolves.toBeUndefined();

    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('still toasts once when sessionStorage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    quota({ exhausted: [{ model: 'gemini-a', kind: 'DAILY', resetAt: RESET }], nowUsing: null });

    await checkGeminiQuota();
    await checkGeminiQuota();

    expect(toast.warning).toHaveBeenCalledTimes(1);
  });
});

describe('afterTranslateStart', () => {
  beforeEach(() => forgetShownQuotaToasts());

  it('checks once after a success and returns the value', async () => {
    const calls = quota({ exhausted: [], nowUsing: 'm' });

    await expect(afterTranslateStart(Promise.resolve(42))).resolves.toBe(42);
    await vi.waitFor(() => expect(calls.filter((c) => c.path === '/api/gemini/quota')).toHaveLength(1));
  });

  it('checks once after an error and rethrows the same error', async () => {
    const calls = quota({ exhausted: [], nowUsing: 'm' });
    const boom = new Error('boom');

    await expect(afterTranslateStart(Promise.reject(boom))).rejects.toBe(boom);
    await vi.waitFor(() => expect(calls.filter((c) => c.path === '/api/gemini/quota')).toHaveLength(1));
  });
});

describe('createQuotaWatcher', () => {
  it('checks when the model changes or the run fails, not on unchanged polls', async () => {
    const calls = quota({ exhausted: [], nowUsing: 'm' });
    const count = () => calls.filter((c) => c.path === '/api/gemini/quota').length;
    const watch = createQuotaWatcher();

    watch('a', false); // baseline
    watch('a', false);
    watch('a', false);
    await Promise.resolve();
    expect(count()).toBe(0);

    watch('a, b', false); // model changed
    await vi.waitFor(() => expect(count()).toBe(1));

    watch('a, b', false);
    expect(count()).toBe(1);

    watch('a, b', true); // failed
    await vi.waitFor(() => expect(count()).toBe(2));

    watch('a, b', true); // still failed: no new check
    await Promise.resolve();
    expect(count()).toBe(2);
  });
});
