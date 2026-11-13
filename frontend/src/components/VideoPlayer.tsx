import { Captions, CaptionsOff, Maximize, Minimize, RectangleHorizontal } from 'lucide-react';
import { useT } from '../lib/i18n';
import { isTyping } from '../lib/keyboard';
import type { CaptionSize } from '../lib/viewerPrefs';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { ViCue } from '../api/client';
import type { PlayerError } from '../player/useYouTubePlayer';
import { SubtitleOverlay } from './SubtitleOverlay';
import { LayoutDebug } from './LayoutDebug'; // TEMP(debug-ios-fullscreen)
import './VideoPlayer.css';

const ERROR_TEXT: Record<PlayerError, [en: string, vi: string]> = {
  EMBED_BLOCKED: ['This video cannot be played in an embedded player.', 'Video này không thể phát trong trình phát nhúng.'],
  LOAD_FAILED: [
    'Could not load the YouTube player. Check your network connection.',
    'Không tải được trình phát YouTube. Hãy kiểm tra kết nối mạng.',
  ],
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
  const t = useT();
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
      {error ? <p className="player__error">{t(...ERROR_TEXT[error])}</p> : <div className="player__video" ref={containerRef} />}
      <LayoutDebug filled={filled} /> {/* TEMP(debug-ios-fullscreen) */}
      <SubtitleOverlay cue={captionsOn ? cue : null} size={captionSize} />
      {/* title, not <Tip>: the tooltip portal renders outside the fullscreen frame, so it would never show there. */}
      <div className="player__tools">
        {onToggleCaptions && (
          <button
            className="player__btn"
            type="button"
            onClick={onToggleCaptions}
            aria-label={captionsOn ? t('Hide Vietsub', 'Ẩn Vietsub') : t('Show Vietsub', 'Hiện Vietsub')}
            title={captionsOn ? t('Hide Vietsub (c)', 'Ẩn Vietsub (c)') : t('Show Vietsub (c)', 'Hiện Vietsub (c)')}
          >
            {captionsOn ? <Captions aria-hidden="true" /> : <CaptionsOff aria-hidden="true" />}
          </button>
        )}
        {onToggleTheater && (
          <button
            className="player__btn"
            type="button"
            onClick={onToggleTheater}
            aria-label={theater ? t('Exit theater mode', 'Thoát chế độ rạp') : t('Theater mode', 'Chế độ rạp')}
            aria-pressed={theater}
            title={theater ? t('Exit theater mode (t)', 'Thoát chế độ rạp (t)') : t('Theater mode (t)', 'Chế độ rạp (t)')}
          >
            <RectangleHorizontal aria-hidden="true" />
          </button>
        )}
        <button
          className="player__btn player__fs"
          type="button"
          onClick={toggle}
          aria-label={expanded ? t('Exit full screen', 'Thoát toàn màn hình') : t('Full screen', 'Toàn màn hình')}
          title={expanded ? t('Exit full screen (f)', 'Thoát toàn màn hình (f)') : t('Full screen (f)', 'Toàn màn hình (f)')}
        >
          {expanded ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
