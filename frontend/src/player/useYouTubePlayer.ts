import { useEffect, useRef, useState, type RefObject } from 'react';
import { loadYouTubeApi, YT_STATE, type YTPlayer } from './youtube';

export type PlayerState = 'loading' | 'ready' | 'playing' | 'paused' | 'ended';
export type PlayerError = 'EMBED_BLOCKED' | 'LOAD_FAILED';

/**
 * Embeds a YouTube video inside `container` and reports its playback time.
 *
 * Uses youtube-nocookie.com and disables YouTube's own fullscreen button (fs: 0), because native
 * fullscreen would cover our subtitle overlay; the page offers its own fullscreen instead.
 * While playing, the time is read every animation frame; otherwise it is refreshed on state changes.
 */
export function useYouTubePlayer(container: RefObject<HTMLDivElement | null>, videoId: string) {
  const [currentMs, setCurrentMs] = useState(0);
  const [state, setState] = useState<PlayerState>('loading');
  const [error, setError] = useState<PlayerError | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setError(null);
    setCurrentMs(0);

    loadYouTubeApi()
      .then((YT) => {
        const host = container.current;
        if (cancelled || !host) return;
        // YouTube replaces the element it is given with an iframe; give it a child so React keeps its node.
        const mount = document.createElement('div');
        host.replaceChildren(mount);
        playerRef.current = new YT.Player(mount, {
          videoId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: { fs: 0, playsinline: 1, rel: 0, iv_load_policy: 3 },
          events: {
            onReady: () => setState('ready'),
            onStateChange: (e) => {
              setCurrentMs(e.target.getCurrentTime() * 1000);
              if (e.data === YT_STATE.PLAYING) setState('playing');
              else if (e.data === YT_STATE.PAUSED) setState('paused');
              else if (e.data === YT_STATE.ENDED) setState('ended');
              else if (e.data === YT_STATE.CUED) setState('ready');
            },
            onError: (e) => setError(e.data === 101 || e.data === 150 ? 'EMBED_BLOCKED' : 'LOAD_FAILED'),
          },
        });
      })
      .catch(() => {
        if (!cancelled) setError('LOAD_FAILED');
      });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [container, videoId]);

  useEffect(() => {
    if (state !== 'playing') return;
    let frame = 0;
    const tick = () => {
      const player = playerRef.current;
      if (player) setCurrentMs(player.getCurrentTime() * 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state]);

  return { currentMs, state, error };
}
