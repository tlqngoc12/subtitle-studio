import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { toast } from 'sonner';
import { findMatches } from '../../lib/chapterText';
import { scrollMatchIntoView } from '../../lib/scrollToMatch';
import { IconButton } from '../ui/IconButton';
import './FindReplace.css';

/**
 * Literal find and replace over the chapter text, shown inside the sticky chapter bar. It selects matches in the textarea
 * (so the person sees them in place); Replace and Replace all change the text through `onChange`, which leaves the
 * chapter unsaved. Not a `<form>`: it sits inside the chapter page, and Enter must never submit anything around it.
 */
export function FindReplace({
  text,
  onChange,
  textareaRef,
  onClose,
  onMatchesChange,
}: {
  text: string;
  onChange: (text: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onClose: () => void;
  /** The matches and the current one (null: none), for painting them behind the textarea; ([], null) on unmount. */
  onMatchesChange?: (matches: { start: number; end: number }[], current: number | null) => void;
}) {
  const ids = useId();
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [current, setCurrent] = useState(0);
  const findInput = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  /** After Replace the text changes on the next render; the next match is looked up from this caret then. */
  const resumeAt = useRef<number | null>(null);

  const matches = useMemo(() => findMatches(text, query, matchCase), [text, query, matchCase]);
  const none = matches.length === 0;
  const shown = none ? 0 : Math.min(current, matches.length - 1) + 1;

  useEffect(() => {
    findInput.current?.focus();
  }, []);

  const report = useRef(onMatchesChange);
  report.current = onMatchesChange;
  useEffect(() => {
    report.current?.(matches, none ? null : shown - 1);
  }, [matches, none, shown]);
  useEffect(() => () => report.current?.([], null), []);

  function select(index: number) {
    const el = textareaRef.current;
    const m = matches[index];
    if (!el || !m) return;
    setCurrent(index);
    // Focus stays where it is (Enter in Find must never type into the text); the match is only selected here, and
    // the textarea gets the focus, with this selection, when the panel closes.
    el.setSelectionRange(m.start, m.end);
    // The panel's bottom is the bottom of the sticky bar: the match should land just under it.
    scrollMatchIntoView(el, m.start, root.current?.getBoundingClientRect().bottom ?? 0);
  }

  function next() {
    if (none) return;
    const from = textareaRef.current?.selectionEnd ?? 0;
    const at = matches.findIndex((m) => m.start >= from);
    select(at < 0 ? 0 : at);
  }

  function previous() {
    if (none) return;
    const from = textareaRef.current?.selectionStart ?? 0;
    let at = -1;
    matches.forEach((m, i) => {
      if (m.end <= from) at = i;
    });
    select(at < 0 ? matches.length - 1 : at);
  }

  function replaceCurrent() {
    const el = textareaRef.current;
    if (!el || none) return;
    const at = matches.findIndex((m) => m.start === el.selectionStart && m.end === el.selectionEnd);
    if (at < 0) {
      next(); // nothing is selected yet: show the match first, replace on the next press
      return;
    }
    const m = matches[at];
    resumeAt.current = m.start + replacement.length;
    onChange(text.slice(0, m.start) + replacement + text.slice(m.end));
  }

  // The text now holds the replacement: select the match that follows it (the first one again after the last).
  useEffect(() => {
    const from = resumeAt.current;
    if (from === null) return;
    resumeAt.current = null;
    if (matches.length === 0) return;
    const at = matches.findIndex((m) => m.start >= from);
    select(at < 0 ? 0 : at);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per text change, with that render's matches
  }, [text]);

  function replaceAll() {
    if (none) return;
    const previousText = text;
    let out = '';
    let last = 0;
    for (const m of matches) {
      out += text.slice(last, m.start) + replacement;
      last = m.end;
    }
    out += text.slice(last);
    const count = matches.length;
    onChange(out);
    // The count is the whole message ("Replaced 12"), so it stays in the title, as the spec words it.
    toast.success('Replaced ' + count, { action: { label: 'Undo', onClick: () => onChange(previousText) } });
  }

  function close() {
    textareaRef.current?.focus();
    onClose();
  }

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }

  function onFindKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault(); // never submit a form around the panel
    if (e.shiftKey) previous();
    else next();
  }

  return (
    <div ref={root} className="find-replace" role="search" aria-label="Find and replace" onKeyDown={onKeyDown}>
      <div className="find-replace__fields">
        <div className="field">
          <label htmlFor={`${ids}-find`}>Find</label>
          <input
            id={`${ids}-find`}
            ref={findInput}
            type="text"
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCurrent(0);
            }}
            onKeyDown={onFindKeyDown}
          />
        </div>
        <div className="field">
          <label htmlFor={`${ids}-replace`}>Replace with</label>
          <input
            id={`${ids}-replace`}
            type="text"
            autoComplete="off"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault(); // never submit a form around the panel
              replaceCurrent();
            }}
          />
        </div>
      </div>
      <div className="find-replace__row">
        <label className="find-replace__case">
          <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} />
          Match case
        </label>
        <span className="find-replace__count muted" aria-live="polite">
          {shown} of {matches.length}
        </span>
        <span className="find-replace__buttons">
          <span className="find-replace__nav">
            <IconButton label="Previous match" icon={ChevronUp} size="s" disabled={none} onClick={previous} />
            <IconButton label="Next match" icon={ChevronDown} size="s" disabled={none} onClick={next} />
          </span>
          <button type="button" className="button button--s" disabled={none} onClick={replaceCurrent}>
            Replace
          </button>
          <button type="button" className="button button--s" disabled={none} onClick={replaceAll}>
            Replace all
          </button>
        </span>
      </div>
    </div>
  );
}
