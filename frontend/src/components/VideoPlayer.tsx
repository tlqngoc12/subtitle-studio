import { useRef, type RefObject } from 'react';
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

/** 16:9 frame holding the YouTube iframe and the subtitle overlay; fullscreen applies to both. */
export function VideoPlayer({ containerRef, cue, error }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);

  return (
    <div className="player-wrap">
      <div className="player" ref={frameRef}>
        {error ? <p className="player__error">{ERROR_TEXT[error]}</p> : <div className="player__video" ref={containerRef} />}
        <SubtitleOverlay cue={cue} />
      </div>
      <div className="player-wrap__controls">
        <button className="button button--small" type="button" onClick={() => void frameRef.current?.requestFullscreen?.()}>
          Toàn màn hình
        </button>
      </div>
    </div>
  );
}
