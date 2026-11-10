import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent } from 'react';
import type { ViCue } from '../../api/client';
import { findScrollTarget } from '../../lib/findActiveCue';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import { Tip } from '../Tip';
import './CueEditorTable.css';

/** How long after the focus leaves the table the highlighted line is followed again. */
export const SCROLL_RESUME_MS = 3000;

/** A player time that moves backwards, or forwards by more than this between two updates, is a seek, not playback. */
export const SEEK_JUMP_MS = 1500;

interface RowProps {
  index: number;
  startMs: number;
  text: string;
  edited: boolean;
  active: boolean;
  readOnly: boolean;
  error: string | undefined;
  onChange: (index: number, text: string) => void;
  onSeek: (index: number, ms: number) => void;
  onFocusRow: (index: number, ms: number) => void;
}

/** One line. Memoised: typing in a row re-renders that row only (the callbacks the parent passes are stable). */
const CueRow = memo(function CueRow({ index, startMs, text, edited, active, readOnly, error, onChange, onSeek, onFocusRow }: RowProps) {
  const area = useRef<HTMLTextAreaElement>(null);
  const number = index + 1;

  // Grow with the text (the CSS `field-sizing: content` does the same where the browser supports it).
  useLayoutEffect(() => {
    const el = area.current;
    if (!el || el.scrollHeight === 0) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  return (
    <tr className={active ? 'cue-row cue-row--active' : 'cue-row'} aria-current={active ? 'true' : undefined}>
      <td className="cue-row__num">
        <button className="cue-row__seek" type="button" aria-label={`Go to line ${number}`} onClick={() => onSeek(index, startMs)}>
          {number}
        </button>
      </td>
      <td className="cue-row__text">
        <label className="visually-hidden" htmlFor={`cue-text-${index}`}>
          {`Line ${number} text`}
        </label>
        <textarea
          id={`cue-text-${index}`}
          ref={area}
          className="cue-row__input"
          rows={1}
          value={text}
          readOnly={readOnly}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `cue-error-${index}` : undefined}
          onChange={(e) => onChange(index, e.target.value)}
          onFocus={() => onFocusRow(index, startMs)}
        />
        {error && (
          <p className="cue-row__error" id={`cue-error-${index}`}>
            {error}
          </p>
        )}
        {edited && (
          <Tip label="Edited">
            <span className="cue-row__dot" role="img" aria-label="Edited" tabIndex={0} />
          </Tip>
        )}
      </td>
    </tr>
  );
});

interface Props {
  /** The lines as loaded: they give the timing and the text to compare the edits with. */
  cues: readonly ViCue[];
  /** The current text of every line (same order as `cues`). */
  texts: readonly string[];
  /** The player time. The table highlights and follows the line on screen, else the one before it, else the first. */
  currentMs: number;
  readOnly: boolean;
  /** Server messages by line index; the first one is scrolled into view when the set changes. */
  errors: Readonly<Record<number, string>>;
  onChange: (index: number, text: string) => void;
  onSeek: (ms: number) => void;
  /** A textarea of another line than the last focused one got focus: seek the video to that line and play it. */
  onSeekPlay: (ms: number) => void;
}

/**
 * The Vietsub lines as a table: number (seeks the video) and an editable text per line.
 * The table highlights the line at the player time (or the one before it in a gap, else the first) and keeps it in
 * view, except while a textarea has focus and for 3 s after it loses it. A seek of the player ends that wait, is followed
 * at once; focus is never moved. Focusing the text of a different line than the last focused one seeks the video to
 * that line and plays it (clicking or moving inside the same line does not), without ending the wait above.
 */
function CueEditorTableImpl({ cues, texts, currentMs, readOnly, errors, onChange, onSeek, onSeekPlay }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const scrollTarget = useMemo(() => findScrollTarget(cues, currentMs), [cues, currentMs]);
  const scrollTo = useCallback(
    (index: number) => {
      const row = box.current?.querySelectorAll('tbody tr')[index];
      row?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    },
    [reduced],
  );

  // A seek (time goes back, or jumps ahead) is an explicit "go there": it cancels any wait, scrolls to the line (also
  // into a gap between lines), even while a textarea has focus. It never moves focus. Normal playback never does this.
  // The # button: seek the video and go to that row at once (the player time may not change, e.g. a paused player).
  const seekRow = useCallback(
    (index: number, ms: number) => {
      window.clearTimeout(timer.current);
      setHolding(false);
      scrollTo(index);
      onSeek(ms);
    },
    [onSeek, scrollTo],
  );

  // The line whose text was focused last (kept when the focus leaves the table), and the time of the seek that
  // focusing it started: that seek is not a "go there" from the user, so it does not end the scroll wait.
  const focusedRow = useRef(-1);
  const focusSeekMs = useRef<number | null>(null);
  const focusRow = useCallback(
    (index: number, ms: number) => {
      if (readOnly || focusedRow.current === index) return;
      focusedRow.current = index;
      focusSeekMs.current = ms;
      onSeekPlay(ms);
    },
    [readOnly, onSeekPlay],
  );

  const lastMs = useRef(currentMs);
  useEffect(() => {
    const delta = currentMs - lastMs.current;
    lastMs.current = currentMs;
    const own = focusSeekMs.current;
    focusSeekMs.current = null;
    if (delta >= 0 && delta <= SEEK_JUMP_MS) return;
    if (own !== null && Math.abs(currentMs - own) < 1) return;
    window.clearTimeout(timer.current);
    setHolding(false);
    if (scrollTarget < 0) return;
    scrollTo(scrollTarget);
  }, [currentMs, scrollTarget, scrollTo]);

  useEffect(() => {
    if (holding || scrollTarget < 0) return;
    scrollTo(scrollTarget);
  }, [scrollTarget, holding, scrollTo]);

  // Lines rejected by a save: show the first one. Clearing a message while typing must not move the table.
  const shownErrors = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const keys = new Set(Object.keys(errors));
    const fresh = [...keys].some((k) => !shownErrors.current.has(k));
    shownErrors.current = keys;
    if (fresh) {
      box.current?.querySelector('[aria-invalid="true"]')?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    }
  }, [errors, reduced]);

  function onFocus(e: FocusEvent) {
    if (!(e.target instanceof HTMLTextAreaElement)) return;
    window.clearTimeout(timer.current);
    setHolding(true);
  }

  function onBlur(e: FocusEvent) {
    if (!(e.target instanceof HTMLTextAreaElement)) return;
    if (e.relatedTarget instanceof HTMLTextAreaElement && box.current?.contains(e.relatedTarget)) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setHolding(false), SCROLL_RESUME_MS);
  }

  return (
    <div className="cue-table" ref={box} onFocus={onFocus} onBlur={onBlur}>
      <table className="cue-table__grid">
        <caption className="visually-hidden">Vietsub lines</caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Text</th>
          </tr>
        </thead>
        <tbody>
          {cues.map((cue, i) => (
            <CueRow
              key={i}
              index={i}
              startMs={cue.startMs}
              text={texts[i]}
              edited={texts[i] !== cue.text}
              active={i === scrollTarget}
              readOnly={readOnly}
              error={errors[i]}
              onChange={onChange}
              onSeek={seekRow}
              onFocusRow={focusRow}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const CueEditorTable = memo(CueEditorTableImpl);
