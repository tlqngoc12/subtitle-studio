import { useEffect, useRef, useState } from 'react';

/** Never hidden within this many pixels of the top of the page. */
const NEAR_TOP = 80;
/** Ignore scroll jitter smaller than this. */
const TOLERANCE = 4;

/**
 * True after the page was scrolled down past the top area, false again on any scroll up or near the top.
 * While `locked` (a popover is open, focus is in the bar) the result is always false, but the scroll direction is
 * still followed, so the bar hides at once if it is released while the reader is scrolled down.
 */
export function useHideOnScroll(locked: boolean): boolean {
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

  return down && !locked;
}
