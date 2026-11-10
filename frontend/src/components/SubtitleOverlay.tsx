import type { ViCue } from '../api/client';
import { CAPTION_SCALE, type CaptionSize } from '../lib/viewerPrefs';
import './SubtitleOverlay.css';

/**
 * The subtitle line over the video. Text is rendered as plain text, never as HTML. `size` scales the caption
 * on top of its responsive size (S 1, M 1.25, L 1.5); without it the size is unchanged.
 */
export function SubtitleOverlay({ cue, size = 's' }: { cue: ViCue | null; size?: CaptionSize }) {
  return (
    <div className="overlay" aria-live="off" style={{ '--caption-scale': CAPTION_SCALE[size] } as React.CSSProperties}>
      {cue && <p className="overlay__line">{cue.text}</p>}
    </div>
  );
}
