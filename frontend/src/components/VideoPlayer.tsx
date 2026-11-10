import { Captions, CaptionsOff, Maximize, Minimize, RectangleHorizontal } from 'lucide-react';
import { isTyping } from '../lib/keyboard';
import type { CaptionSize } from '../lib/viewerPrefs';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { ViCue } from '../api/client';
import type { PlayerError } from '../player/useYouTubePlayer';
import { SubtitleOverlay } from './SubtitleOverlay';
import './VideoPlayer.css';

const ERROR_TEXT: Record<PlayerError, string> = {
  EMBED_BLOCKED: 'This video cannot be played in an embedded player.',
  LOAD_FAILED: 'Could not load the YouTube player. Check your network connection.',
};

/** Older Safari (and iPad) only has the prefixed Fullscreen API. */
type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => void };
type FullscreenDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };

interface Props {
  containerRef: RefObject<HTMLDivElement | null>;
  cue: ViCue | null;
  error: PlayerError | null;
  /** The Vietsub overlay is shown (default). */
  captionsOn?: boolean;
  /** When given, a button in the frame turns the Vietsub on and off. */
  onToggleCaptions?: () => void;
  /** The Vietsub size (S / M / L); default S. */
  captionSize?: CaptionSize;
  /** When given, a button in the frame turns theater mode on and off. */
  theater?: boolean;
  onToggleTheater?: () => void;
}

/**
 * 16:9 frame holding the YouTube iframe and the subtitle overlay. Fullscreen applies to this frame,
 * so the overlay stays visible; YouTube's own fullscreen button is disabled, and ours sits where
 * YouTube puts it (bottom-right corner). The F key toggles it too, unless focus is inside the iframe.
 *
 * iPhone Safari has no Fullscreen API for anything but <video> (and YouTube's native fullscreen would hide
 * the Vietsub overlay), so there the frame instead fills the viewport ("filled" mode); Escape or the button
 * leaves it.
 */
export function VideoPlayer({
  containerRef,
  cue,
  error,
  captionsOn = true,
  onToggleCaptions,
  captionSize,
  theater = false,
  onToggleTheater,
}: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    const doc = document as FullscreenDocument;
    const onChange = () =>
      setFullscreen((doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null) === frameRef.current);
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  // While filled, the page behind must not scroll.
  useEffect(() => {
    if (!filled) return;
    document.documentElement.classList.add('player-filled-open');
    return () => document.documentElement.classList.remove('player-filled-open');
  }, [filled]);

  const toggle = useCallback(() => {
    if (filled) {
      setFilled(false);
      return;
    }
    const doc = document as FullscreenDocument;
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      if (doc.exitFullscreen) void doc.exitFullscreen();
      else doc.webkitExitFullscreen?.();
      return;
    }
    const frame = frameRef.current as FullscreenElement | null;
    if (!frame) return;
    if (frame.requestFullscreen) void frame.requestFullscreen();
    else if (frame.webkitRequestFullscreen) frame.webkitRequestFullscreen();
    else setFilled(true);
  }, [filled]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && filled) {
        setFilled(false);
        return;
      }
      if ((e.key !== 'f' && e.key !== 'F') || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      e.preventDefault();
      toggle();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toggle, filled]);

  const expanded = fullscreen || filled;

  return (
    <div className={filled ? 'player player--filled' : 'player'} ref={frameRef}>
      {error ? <p className="player__error">{ERROR_TEXT[error]}</p> : <div className="player__video" ref={containerRef} />}
      <SubtitleOverlay cue={captionsOn ? cue : null} size={captionSize} />
      {/* title, not <Tip>: the tooltip portal renders outside the fullscreen frame, so it would never show there. */}
      <div className="player__tools">
        {onToggleCaptions && (
          <button
            className="player__btn"
            type="button"
            onClick={onToggleCaptions}
            aria-label={captionsOn ? 'Hide Vietsub' : 'Show Vietsub'}
            title={captionsOn ? 'Hide Vietsub (c)' : 'Show Vietsub (c)'}
          >
            {captionsOn ? <Captions aria-hidden="true" /> : <CaptionsOff aria-hidden="true" />}
          </button>
        )}
        {onToggleTheater && (
          <button
            className="player__btn"
            type="button"
            onClick={onToggleTheater}
            aria-label={theater ? 'Exit theater mode' : 'Theater mode'}
            aria-pressed={theater}
            title={theater ? 'Exit theater mode (t)' : 'Theater mode (t)'}
          >
            <RectangleHorizontal aria-hidden="true" />
          </button>
        )}
        <button
          className="player__btn player__fs"
          type="button"
          onClick={toggle}
          aria-label={expanded ? 'Exit full screen' : 'Full screen'}
          title={expanded ? 'Exit full screen (f)' : 'Full screen (f)'}
        >
          {expanded ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
