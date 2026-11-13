import { useEffect, useRef } from 'react';
import { getNovel, type NovelDetail } from '../api/novels';
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
    const timer = setInterval(() => {
      getNovel(novelId)
        .then((n) => callback.current(n))
        .catch(() => {});
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [novelId, active]);
}
