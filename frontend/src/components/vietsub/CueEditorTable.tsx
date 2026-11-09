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
  onSeek: (ms: number) => void;
}

/** One line. Memoised: typing in a row re-renders that row only (the callbacks the parent passes are stable). */
const CueRow = memo(function CueRow({ index, startMs, text, edited, active, readOnly, error, onChange, onSeek }: RowProps) {
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
        <button className="cue-row__seek" type="button" aria-label={`Go to line ${number}`} onClick={() => onSeek(startMs)}>
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
  /** Index of the line on screen now, or -1 (the highlight). */
  activeIndex: number;
  /** The player time. The table follows the line on screen, or the one before it in a gap, and any seek. */
  currentMs: number;
  readOnly: boolean;
  /** Server messages by line index; the first one is scrolled into view when the set changes. */
  errors: Readonly<Record<number, string>>;
  onChange: (index: number, text: string) => void;
  onSeek: (ms: number) => void;
}

/**
 * The Vietsub lines as a table: number (seeks the video) and an editable text per line.
 * The table keeps the line at the player time in view (the highlighted one, or the one before it in a gap), except
 * while a textarea has focus and for 3 s after it loses it. A seek of the player ends that wait and is followed at once.
 */
function CueEditorTableImpl({ cues, texts, activeIndex, currentMs, readOnly, errors, onChange, onSeek }: Props) {
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

  // A seek (time goes back, or jumps ahead) cancels the wait after a blur and is followed at once, even into a gap
  // between lines. While a textarea still has focus the user is typing, so the table stays put.
  const lastMs = useRef(currentMs);
  useEffect(() => {
    const delta = currentMs - lastMs.current;
    lastMs.current = currentMs;
    if (delta >= 0 && delta <= SEEK_JUMP_MS) return;
    if (box.current?.contains(document.activeElement) && document.activeElement instanceof HTMLTextAreaElement) return;
    window.clearTimeout(timer.current);
    setHolding(false);
    if (scrollTarget >= 0) scrollTo(scrollTarget);
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
              active={i === activeIndex}
              readOnly={readOnly}
              error={errors[i]}
              onChange={onChange}
              onSeek={onSeek}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const CueEditorTable = memo(CueEditorTableImpl);
