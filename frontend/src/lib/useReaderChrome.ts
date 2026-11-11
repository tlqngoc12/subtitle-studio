import { useCallback, useEffect, useRef, useState } from 'react';

/** Never hidden within this many pixels of the top of the page. */
const NEAR_TOP = 80;
/** Ignore scroll jitter smaller than this. */
const TOLERANCE = 4;

/**
 * Whether the reader's bars are hidden. Follows the scroll direction like `useScrollDirection` (down hides, up shows,
 * always shown near the top); `toggle()` flips the current state and the next scroll direction change overrides it.
 * While `locked` (a drawer or sheet is open, keyboard focus is in the bar) the bars are always shown.
 */
export function useReaderChrome(locked: boolean): { hidden: boolean; toggle: () => void; show: () => void } {
  const [down, setDown] = useState(false);
  const last = useRef(0);

  useEffect(() => {
    last.current = window.scrollY;
    function onScroll() {
      const y = window.scrollY;
      if (y <= NEAR_TOP) {
        setDown(false);
        last.current = y;
      } else if (y > last.current + TOLERANCE) {
        setDown(true);
        last.current = y;
      } else if (y < last.current - TOLERANCE) {
        setDown(false);
        last.current = y;
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const hidden = down && !locked;
  const toggle = useCallback(() => setDown(!hidden), [hidden]);
  const show = useCallback(() => setDown(false), []);
  return { hidden, toggle, show };
}
