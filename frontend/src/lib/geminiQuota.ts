import { toast } from 'sonner';
import { getGeminiQuota } from '../api/gemini';
import { formatInstantWithTime } from './dates';

/*
 * Quota toasts. There is deliberately no timer here: the check runs only right after a translation is started
 * (afterTranslateStart) and when a polling hook that already exists sees the model change or the run fail.
 */

const STORAGE_PREFIX = 'subtitle-studio.quotaToast.';
const shown = new Set<string>(); // fallback when sessionStorage is unavailable, and a fast path

function wasShown(key: string): boolean {
  if (shown.has(key)) return true;
  try {
    return sessionStorage.getItem(STORAGE_PREFIX + key) !== null;
  } catch {
    return false;
  }
}

function markShown(key: string): void {
  shown.add(key);
  try {
    sessionStorage.setItem(STORAGE_PREFIX + key, '1');
  } catch {
    // in-memory set only
  }
}

/** For tests: forget which entries were already toasted. */
export function forgetShownQuotaToasts(): void {
  shown.clear();
  try {
    for (const k of Object.keys(sessionStorage)) {
      if (k.startsWith(STORAGE_PREFIX)) sessionStorage.removeItem(k);
    }
  } catch {
    // nothing to clear
  }
}

/**
 * Asks the backend which models are out of quota and toasts every DAILY entry not toasted yet in this session.
 * Never throws and never shows an error: a failed check is silent.
 */
export async function checkGeminiQuota(): Promise<void> {
  try {
    const quota = await getGeminiQuota();
    for (const entry of quota.exhausted) {
      if (entry.kind !== 'DAILY') continue;
      const key = `${entry.model}|${entry.resetAt}`;
      if (wasShown(key)) continue;
      markShown(key);
      const resets = `Daily quota resets at ${formatInstantWithTime(entry.resetAt)} (Vietnam time).`;
      const next = quota.nowUsing ? `Now using ${quota.nowUsing}.` : 'No model left until then.';
      toast.warning(`${entry.model} is out of quota`, { description: `${resets} ${next}`, duration: 10000 });
    }
  } catch {
    // ignored on purpose
  }
}

/** Runs the quota check once `p` has settled (resolved or rejected) and returns or rethrows `p`'s outcome unchanged. */
export async function afterTranslateStart<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } finally {
    void checkGeminiQuota();
  }
}

/**
 * For a polling hook: call it with every poll's model and failed flag. It checks the quota when the model differs
 * from the previous poll or the run has just failed; the first poll is only a baseline (unless already failed).
 */
export function createQuotaWatcher(): (model: string | null, failed: boolean) => void {
  let seen = false;
  let lastModel: string | null = null;
  let lastFailed = false;
  return (model, failed) => {
    const modelChanged = seen && model !== lastModel;
    const justFailed = failed && !lastFailed;
    seen = true;
    lastModel = model;
    lastFailed = failed;
    if (modelChanged || justFailed) void checkGeminiQuota();
  };
}
