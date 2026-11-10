import { useEffect, useState, type RefObject } from 'react';

function measure(el: HTMLElement | null): number {
  if (!el) return 0;
  const { top, height } = el.getBoundingClientRect();
  const range = height - window.innerHeight;
  if (range <= 0) return 1;
  // (scrollY - documentTop) / range, where documentTop = top + scrollY.
  const p = -top / range;
  return Math.min(1, Math.max(0, p));
}

/** How far through the element the viewport has scrolled, 0..1; updated at most once per animation frame. */
export function useScrollProgress(ref: RefObject<HTMLElement | null>): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    function schedule() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setProgress(measure(ref.current));
      });
    }
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref]);

  // The element may mount after the hook (the chapter loads later): re-measure after every render.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setProgress(measure(ref.current)));
    return () => cancelAnimationFrame(frame);
  });

  return progress;
}

/** Scrolls the window so that `p` (0..1) of the element has been passed. */
export function scrollToProgress(el: HTMLElement, p: number): void {
  const top = el.getBoundingClientRect().top + window.scrollY;
  const range = Math.max(0, el.getBoundingClientRect().height - window.innerHeight);
  window.scrollTo({ top: top + Math.min(1, Math.max(0, p)) * range });
}
