import { useEffect, useRef, useState } from 'react';

interface Options {
  /** Ignore scroll moves smaller than this many pixels. */
  threshold?: number;
  /** Never hide within this many pixels of the top. */
  hideAfter?: number;
  /** While true (keyboard focus is in the bar) it is never hidden. */
  locked?: boolean;
}

/**
 * Follows the page scroll for a top bar: `hidden` after scrolling down past `hideAfter` by `threshold` px, shown again
 * by scrolling up by `threshold` px or at the top; `scrolled` is true once the page left the very top.
 */
export function useScrollDirection({ threshold = 8, hideAfter = 64, locked = false }: Options = {}): {
  hidden: boolean;
  scrolled: boolean;
} {
  const [down, setDown] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const anchor = useRef(0);

  useEffect(() => {
    anchor.current = window.scrollY;
    setScrolled(window.scrollY > 0);
    function onScroll() {
      const y = window.scrollY;
      setScrolled(y > 0);
      if (y <= hideAfter) {
        setDown(false);
        anchor.current = y;
      } else if (y - anchor.current >= threshold) {
        setDown(true);
        anchor.current = y;
      } else if (anchor.current - y >= threshold) {
        setDown(false);
        anchor.current = y;
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold, hideAfter]);

  return { hidden: down && !locked, scrolled };
}
