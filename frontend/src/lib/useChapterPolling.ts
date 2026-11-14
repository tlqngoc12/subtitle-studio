import { useEffect, useRef } from 'react';
import { getChapter, type ChapterDetail } from '../api/novels';
import { createQuotaWatcher } from './geminiQuota';
import { POLL_INTERVAL_MS } from './useTranslationPolling';

/** While `id` is not null, asks for the chapter every 3 s and reports it (errors: try again next tick). */
export function useChapterPolling(id: number | null, onUpdate: (chapter: ChapterDetail) => void) {
  const callback = useRef(onUpdate);
  callback.current = onUpdate;

  useEffect(() => {
    if (id === null) return;
    const watch = createQuotaWatcher(); // a model change or a failure may mean a quota ran out
    const timer = setInterval(() => {
      getChapter(id)
        .then((c) => {
          watch(c.translationModel, c.translationStatus === 'FAILED');
          callback.current(c);
        })
        .catch(() => {});
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [id]);
}
