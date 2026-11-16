import { useLayoutEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import './FindHighlights.css';

export interface Hit {
  start: number;
  end: number;
}

/** Computed styles of the textarea that decide where its lines break and where each glyph sits. */
const COPIED = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'fontKerning',
  'fontVariantLigatures',
  'fontFeatureSettings',
  'lineHeight',
  'letterSpacing',
  'wordSpacing',
  'textIndent',
  'textTransform',
  'tabSize',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'boxSizing',
  'width',
  'whiteSpace',
  'overflowWrap',
  'wordBreak',
] as const;
const BORDERS = ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'] as const;

/**
 * The matches of find and replace painted behind the chapter textarea (a mirror of its text where only the matches
 * are visible, the way code editors do it), because a textarea hides its selection while the focus is elsewhere.
 * It copies the textarea's wrapping styles, so every mark sits exactly on its word. Purely decorative: `aria-hidden`
 * and it never takes a click. The textarea grows with its text (no inner scroll), `scrollTop` is mirrored anyway.
 */
export function FindHighlights({
  text,
  matches,
  current,
  textareaRef,
}: {
  text: string;
  matches: Hit[];
  current: number | null;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const box = useRef<HTMLDivElement>(null);

  const parts = useMemo(() => {
    const out: ReactNode[] = [];
    let last = 0;
    matches.forEach((m, i) => {
      if (m.start > last) out.push(text.slice(last, m.start));
      out.push(
        <mark key={i} className={i === current ? 'find-hit find-hit--current' : 'find-hit'}>
          {text.slice(m.start, m.end)}
        </mark>,
      );
      last = m.end;
    });
    out.push(text.slice(last) + '\n'); // a trailing newline would otherwise add no line to the mirror
    return out;
  }, [text, matches, current]);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    const mirror = box.current;
    if (!el || !mirror) return;
    const sync = () => {
      const cs = getComputedStyle(el);
      for (const name of COPIED) mirror.style[name] = cs[name];
      // The textarea's own line-height is a ratio; the px value read back is rounded, which drifts over 500 lines.
      const ratio = parseFloat(cs.lineHeight) / parseFloat(cs.fontSize);
      if (Number.isFinite(ratio)) mirror.style.lineHeight = String(ratio);
      mirror.style.borderStyle = 'solid';
      mirror.style.borderColor = 'transparent';
      for (const name of BORDERS) mirror.style[name] = cs[name];
      mirror.style.color = 'transparent';
      mirror.scrollTop = el.scrollTop;
    };
    sync();
    const onScroll = () => {
      mirror.scrollTop = el.scrollTop;
    };
    el.addEventListener('scroll', onScroll);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync);
    observer?.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      observer?.disconnect();
    };
  }, [textareaRef]);

  return (
    <div ref={box} className="find-hits" aria-hidden="true">
      {parts}
    </div>
  );
}
