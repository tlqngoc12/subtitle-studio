import { memo, useEffect, useLayoutEffect, useRef, useState, type FocusEvent } from 'react';
import type { ViCue } from '../../api/client';
import { formatTimecode } from '../../lib/format';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import { Tip } from '../Tip';
import './CueEditorTable.css';

/** How long after the focus leaves the table the highlighted line is followed again. */
export const SCROLL_RESUME_MS = 3000;

interface RowProps {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
  edited: boolean;
  active: boolean;
  readOnly: boolean;
  onChange: (index: number, text: string) => void;
  onSeek: (ms: number) => void;
}

/** One line. Memoised: typing in a row re-renders that row only (the callbacks the parent passes are stable). */
const CueRow = memo(function CueRow({ index, startMs, endMs, text, edited, active, readOnly, onChange, onSeek }: RowProps) {
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
      <td className="cue-row__time">{formatTimecode(startMs)}</td>
      <td className="cue-row__time cue-row__time--end">{formatTimecode(endMs)}</td>
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
          onChange={(e) => onChange(index, e.target.value)}
        />
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
  /** Index of the line on screen now, or -1. */
  activeIndex: number;
  readOnly: boolean;
  onChange: (index: number, text: string) => void;
  onSeek: (ms: number) => void;
}

/**
 * The Vietsub lines as a table: number (seeks the video), read-only times, and an editable text per line.
 * The table keeps the highlighted line in view, except while a textarea has focus and for 3 s after it loses it.
 */
function CueEditorTableImpl({ cues, texts, activeIndex, readOnly, onChange, onSeek }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (holding || activeIndex < 0) return;
    const row = box.current?.querySelector('tr[aria-current="true"]');
    row?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [activeIndex, holding, reduced]);

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
            <th scope="col">Start</th>
            <th scope="col" className="cue-row__time--end">End</th>
            <th scope="col">Text</th>
          </tr>
        </thead>
        <tbody>
          {cues.map((cue, i) => (
            <CueRow
              key={i}
              index={i}
              startMs={cue.startMs}
              endMs={cue.endMs}
              text={texts[i]}
              edited={texts[i] !== cue.text}
              active={i === activeIndex}
              readOnly={readOnly}
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
