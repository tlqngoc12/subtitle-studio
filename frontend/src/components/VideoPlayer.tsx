import { Maximize, Minimize } from 'lucide-react';
import { isTyping } from '../lib/keyboard';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { ViCue } from '../api/client';
import type { PlayerError } from '../player/useYouTubePlayer';
import { SubtitleOverlay } from './SubtitleOverlay';

const ERROR_TEXT: Record<PlayerError, string> = {
  EMBED_BLOCKED: 'This video cannot be played in an embedded player.',
  LOAD_FAILED: 'Could not load the YouTube player. Check your network connection.',
};

interface Props {
  containerRef: RefObject<HTMLDivElement | null>;
  cue: ViCue | null;
  error: PlayerError | null;
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
        aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
        title={fullscreen ? 'Exit full screen (f)' : 'Full screen (f)'}
      >
        {fullscreen ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
      </button>
    </div>
  );
}
