import { useEffect, useRef } from 'react';
import { getChapter, type ChapterDetail } from '../api/novels';
import { POLL_INTERVAL_MS } from './useTranslationPolling';

/** While `id` is not null, asks for the chapter every 3 s and reports it (errors: try again next tick). */
export function useChapterPolling(id: number | null, onUpdate: (chapter: ChapterDetail) => void) {
  const callback = useRef(onUpdate);
  callback.current = onUpdate;

  useEffect(() => {
    if (id === null) return;
    const timer = setInterval(() => {
      getChapter(id)
        .then((c) => callback.current(c))
        .catch(() => {});
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [id]);
}
