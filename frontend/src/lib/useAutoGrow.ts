import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/** The textarea is never shorter than this share of the window height. */
const MIN_SHARE = 0.6;

/**
 * Makes a textarea as tall as its text (at least 60 % of the window), so only the page scrolls. It measures on mount,
 * when `value` changes and when the textarea's width changes (the text rewraps), and never more than once per
 * animation frame however fast the keys come.
 */
export function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string): void {
  const frame = useRef(0);

  const measure = useCallback(() => {
    if (frame.current) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = 0;
      const el = ref.current;
      if (!el) return;
      const scrolled = window.scrollY;
      el.style.height = 'auto'; // shrink first, or scrollHeight never reports a smaller value
      el.style.height = `${Math.max(window.innerHeight * MIN_SHARE, el.scrollHeight)}px`;
      if (window.scrollY !== scrolled) window.scrollTo(0, scrolled); // the shrink must not move the page
    });
  }, [ref]);

  useLayoutEffect(() => {
    measure();
  }, [value, measure]);

  // The textarea may mount after the first render (a page that loads first), so look for it after every render and
  // observe it once it is there.
  const watched = useRef<{ el: HTMLTextAreaElement; observer: ResizeObserver } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (watched.current?.el === el) return;
    watched.current?.observer.disconnect();
    watched.current = null;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      measure();
    });
    observer.observe(el);
    watched.current = { el, observer };
  });

  useEffect(
    () => () => {
      watched.current?.observer.disconnect();
      if (frame.current) window.cancelAnimationFrame(frame.current);
    },
    [],
  );
}
