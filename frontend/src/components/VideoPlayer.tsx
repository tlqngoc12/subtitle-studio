import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { ViCue } from '../api/client';
import type { PlayerError } from '../player/useYouTubePlayer';
import { SubtitleOverlay } from './SubtitleOverlay';

const ERROR_TEXT: Record<PlayerError, string> = {
  EMBED_BLOCKED: 'Video này không cho phép phát nhúng trong app.',
  LOAD_FAILED: 'Không tải được trình phát YouTube. Kiểm tra kết nối mạng.',
};

interface Props {
  containerRef: RefObject<HTMLDivElement | null>;
  cue: ViCue | null;
  error: PlayerError | null;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]') !== null;
}

/**
 * 16:9 frame holding the YouTube iframe and the subtitle overlay. Fullscreen applies to this frame,
 * so the overlay stays visible; YouTube's own fullscreen button is disabled, and ours sits where
 * YouTube puts it (bottom-right corner). The F key toggles it too, unless focus is inside the iframe.
 */
export function VideoPlayer({ containerRef, cue, error }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void frameRef.current?.requestFullscreen?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'f' && e.key !== 'F') || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      e.preventDefault();
      toggle();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toggle]);

  return (
    <div className="player" ref={frameRef}>
      {error ? <p className="player__error">{ERROR_TEXT[error]}</p> : <div className="player__video" ref={containerRef} />}
      <SubtitleOverlay cue={cue} />
      <button
        className="player__fs"
        type="button"
        onClick={toggle}
        aria-label={fullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
        title={fullscreen ? 'Thoát toàn màn hình (f)' : 'Toàn màn hình (f)'}
      >
        {fullscreen ? (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </svg>
        )}
      </button>
    </div>
  );
}
