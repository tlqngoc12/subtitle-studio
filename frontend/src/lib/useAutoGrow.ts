import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/** The textarea is never shorter than this share of the window height. */
const MIN_SHARE = 0.6;
/** How many extra frames the safety net may use when the text still does not fit. */
const MAX_RETRIES = 3;

/**
 * Makes a textarea as tall as its text (at least 60 % of the window), so only the page scrolls. It measures on mount,
 * when `value` changes, when the textarea's width changes (the text rewraps), once the web fonts have loaded (they
 * change line breaks) and never more than once per animation frame however fast the keys come. The height includes
 * the border, and if the text still does not fit after measuring, it measures again on the next frame: with
 * `overflow-y: hidden`, any text that does not fit cannot be reached.
 */
export function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string): void {
  const frame = useRef(0);
  const retries = useRef(0);

  const measure = useCallback(() => {
    if (frame.current) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = 0;
      const el = ref.current;
      if (!el) return;
      const scrolled = window.scrollY;
      el.style.height = 'auto'; // shrink first, or scrollHeight never reports a smaller value
      // scrollHeight leaves out the border; the box includes it, or the last lines would be clipped.
      const border = el.offsetHeight - el.clientHeight;
      el.style.height = `${Math.max(window.innerHeight * MIN_SHARE, el.scrollHeight + border)}px`;
      if (window.scrollY !== scrolled) window.scrollTo(0, scrolled); // the shrink must not move the page
      if (el.scrollHeight > el.clientHeight && retries.current < MAX_RETRIES) {
        retries.current += 1;
        measure();
      } else {
        retries.current = 0;
      }
    });
  }, [ref]);

  useLayoutEffect(() => {
    measure();
  }, [value, measure]);

  // Web fonts change the line breaks when they arrive, after the first measure.
  useEffect(() => {
    const fonts = typeof document === 'undefined' ? undefined : document.fonts;
    if (!fonts) return;
    let alive = true;
    void fonts.ready?.then(() => alive && measure());
    const onDone = () => measure();
    fonts.addEventListener?.('loadingdone', onDone);
    return () => {
      alive = false;
      fonts.removeEventListener?.('loadingdone', onDone);
    };
  }, [measure]);

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
      // Reset both: StrictMode (dev) runs this cleanup and then the effects again on the same refs. A frame id left
      // behind would make measure() think a frame is still pending, so the textarea would never grow.
      watched.current?.observer.disconnect();
      watched.current = null;
      if (frame.current) window.cancelAnimationFrame(frame.current);
      frame.current = 0;
    },
    [],
  );
}
