import type { ViCue } from '../api/client';

/** The subtitle line over the video. Text is rendered as plain text, never as HTML. */
export function SubtitleOverlay({ cue }: { cue: ViCue | null }) {
  return (
    <div className="overlay" aria-live="off">
      {cue && <p className="overlay__line">{cue.text}</p>}
    </div>
  );
}
