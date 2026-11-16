import { useEffect, useRef } from 'react';
import { getNovel, type NovelDetail } from '../api/novels';
import { createQuotaWatcher } from './geminiQuota';
import { POLL_INTERVAL_MS } from './useTranslationPolling';

/**
 * While `active`, asks the server for the novel every 3 s and reports it (errors: try again next tick). It reads
 * the novel only, never the Wattpad parts, so polling never calls Wattpad.
 */
export function useNovelPolling(novelId: number, active: boolean, onUpdate: (novel: NovelDetail) => void) {
  const callback = useRef(onUpdate);
  callback.current = onUpdate;

  useEffect(() => {
    if (!active) return;
    const watch = createQuotaWatcher(); // a model change or a failure may mean a quota ran out
    const timer = setInterval(() => {
      getNovel(novelId)
        .then((n) => {
          const translating = n.chapters.filter((c) => c.translationStatus === 'TRANSLATING');
          const model = translating.map((c) => c.translationModel ?? '').join('|') || null;
          const failed = n.chapters.some((c) => c.translationStatus === 'FAILED');
          watch(model, failed);
          callback.current(n);
        })
        .catch(() => {});
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [novelId, active]);
}
