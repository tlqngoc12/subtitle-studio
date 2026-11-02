/** Minimal typing for the parts of the YouTube IFrame Player API we use. */
export interface YTPlayer {
  getCurrentTime(): number;
  destroy(): void;
  /** Undocumented but long-standing: unloadModule('captions') hides YouTube's own subtitles. */
  unloadModule?(name: string): void;
}

export interface YTPlayerEvent {
  data: number;
  target: YTPlayer;
}

export interface YTPlayerOptions {
  videoId: string;
  host?: string;
  playerVars?: Record<string, number | string>;
  events?: {
    onReady?: (e: YTPlayerEvent) => void;
    onStateChange?: (e: YTPlayerEvent) => void;
    onError?: (e: YTPlayerEvent) => void;
  };
}

export interface YTNamespace {
  Player: new (element: HTMLElement, options: YTPlayerOptions) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** YouTube player state codes (YT.PlayerState). */
export const YT_STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

let loading: Promise<YTNamespace> | null = null;

/** Loads https://www.youtube.com/iframe_api once and resolves with window.YT. */
export function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!loading) {
    loading = new Promise<YTNamespace>((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve(window.YT!);
      };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => {
        loading = null; // allow a retry on the next page
        reject(new Error('YouTube IFrame API failed to load'));
      };
      document.head.appendChild(script);
    });
  }
  return loading;
}
