import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { loadYouTubeApi, YT_STATE, type YTPlayer } from './youtube';

export type PlayerState = 'loading' | 'ready' | 'playing' | 'paused' | 'ended';
export type PlayerError = 'EMBED_BLOCKED' | 'LOAD_FAILED';

/**
 * Embeds a YouTube video inside `container` and reports its playback time. A new `videoId` is loaded into the
 * same player (loadVideoById, or cueVideoById without autoplay), keeping the iframe, its user activation
 * and page fullscreen (which is on the container's frame).
 *
 * Uses youtube-nocookie.com and disables YouTube's own fullscreen button (fs: 0), because native
 * fullscreen would cover our subtitle overlay; the page offers its own fullscreen instead.
 * While playing, the time is read every animation frame; otherwise it is refreshed on state changes.
 */
export function useYouTubePlayer(
  container: RefObject<HTMLDivElement | null>,
  videoId: string,
  options?: { autoplay?: boolean },
) {
  const [currentMs, setCurrentMs] = useState(0);
  // Read when a video is started, so changing it alone does not touch the player.
  const autoplayRef = useRef(false);
  autoplayRef.current = options?.autoplay === true;
  const [state, setState] = useState<PlayerState>('loading');
  // The video the state above belongs to. Right after `videoId` changes the old state (e.g. 'ended') would
  // still be returned for one render; reporting 'loading' instead keeps "play the next video" from firing twice.
  const [stateFor, setStateFor] = useState(videoId);
  const [error, setError] = useState<PlayerError | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef(false);
  const videoIdRef = useRef(videoId);
  videoIdRef.current = videoId;
  // The video the player was last told to show (constructor or load/cue call).
  const shownRef = useRef<string | null>(null);

  /** Starts or cues `id` on the existing player: the iframe (and its user activation) is kept. */
  const show = useCallback((player: YTPlayer, id: string) => {
    shownRef.current = id;
    if (autoplayRef.current) player.loadVideoById(id);
    else player.cueVideoById(id);
  }, []);

  // One player per container: a new iframe would have no user activation, so the browser would block
  // unmuted autoplay of the next playlist video (Edge, Safari). It is destroyed only on unmount.
  useEffect(() => {
    let cancelled = false;
    setError(null);

    loadYouTubeApi()
      .then((YT) => {
        const host = container.current;
        if (cancelled || !host) return;
        // YouTube replaces the element it is given with an iframe; give it a child so React keeps its node.
        const mount = document.createElement('div');
        host.replaceChildren(mount);
        shownRef.current = videoIdRef.current;
        playerRef.current = new YT.Player(mount, {
          videoId: videoIdRef.current,
          host: 'https://www.youtube-nocookie.com',
          // cc_load_policy 0 + unloading the captions module: YouTube's own subtitles would sit
          // where the Vietsub overlay is (it auto-enables them e.g. for foreign-language videos).
          // autoplay: the next video of a playlist starts by itself (the user already interacted with the page).
          playerVars: {
            fs: 0,
            playsinline: 1,
            rel: 0,
            iv_load_policy: 3,
            cc_load_policy: 0,
            autoplay: autoplayRef.current ? 1 : 0,
          },
          events: {
            onReady: (e) => {
              readyRef.current = true;
              e.target.unloadModule?.('captions');
              // The video changed while the player was starting up.
              if (shownRef.current !== videoIdRef.current) show(e.target, videoIdRef.current);
              else setState('ready');
            },
            onStateChange: (e) => {
              setCurrentMs(e.target.getCurrentTime() * 1000);
              if (e.data === YT_STATE.PLAYING) {
                e.target.unloadModule?.('captions'); // YouTube reloads captions when playback starts
                setState('playing');
              }
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
      readyRef.current = false;
      shownRef.current = null;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [container, show]);

  // A new video goes into the same player.
  useEffect(() => {
    setState('loading');
    setStateFor(videoId);
    setError(null);
    setCurrentMs(0);
    const player = playerRef.current;
    if (player && readyRef.current && shownRef.current !== videoId) show(player, videoId);
  }, [videoId, show]);

  useEffect(() => {
    if (state === 'loading') return;
    // Only re-render when the time actually changed.
    const read = () => {
      const player = playerRef.current;
      if (!player) return;
      const ms = player.getCurrentTime() * 1000;
      setCurrentMs((prev) => (prev === ms ? prev : ms));
    };
    if (state === 'playing') {
      let frame = 0;
      const tick = () => {
        read();
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(frame);
    }
    // Paused/ready/ended: YouTube often fires no event for a seek, so poll slowly.
    const timer = setInterval(read, 250);
    return () => clearInterval(timer);
  }, [state]);

  /** Jumps to the given millisecond (no-op until the player is ready) and shows the new time without waiting for the next poll. */
  const seekTo = useCallback((ms: number) => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;
    player.seekTo(ms / 1000, true);
    setCurrentMs(ms);
  }, []);

  return { currentMs, state: stateFor === videoId ? state : 'loading', error, seekTo };
}
