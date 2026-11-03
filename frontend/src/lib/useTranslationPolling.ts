import { useEffect, useRef } from 'react';
import { ApiError, getVideo, type VideoDto } from '../api/client';

export const POLL_INTERVAL_MS = 3000;

/**
 * While `ids` is not empty, asks the server for each of those videos every 3 s and reports the answer.
 * A 404 means the video was deleted elsewhere: `onGone` is called and polling for it stops with `ids`.
 */
export function useTranslationPolling(
  ids: string[],
  onUpdate: (video: VideoDto) => void,
  onGone: (id: string) => void,
) {
  const callbacks = useRef({ onUpdate, onGone });
  callbacks.current = { onUpdate, onGone };
  const key = [...new Set(ids)].sort().join(',');

  useEffect(() => {
    if (!key) return;
    const pending = key.split(',');
    const timer = setInterval(() => {
      for (const id of pending) {
        getVideo(id)
          .then((video) => callbacks.current.onUpdate(video))
          .catch((e) => {
            if (e instanceof ApiError && e.status === 404) callbacks.current.onGone(id);
            // other errors: try again on the next tick
          });
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [key]);
}
