import { useEffect, useState, type RefObject } from 'react';

/** Copy (C), save (S), print (P), view source (U), select all (A): with Ctrl or ⌘. */
const BLOCKED_KEYS = new Set(['c', 's', 'p', 'u', 'a']);

/**
 * Makes copying a chapter harder (spec section 8): no context menu, dragging, copy or cut inside `ref`; no copy /
 * save / print / view-source / select-all shortcuts on the page; `hidden` while the window is inactive (another
 * app, a screenshot tool, a hidden tab) so the page can blur its images. A determined reader can still take a
 * photo; the watermark in the images covers that.
 */
export function useCopyGuard(ref: RefObject<HTMLElement | null>): { hidden: boolean } {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const area = ref.current;
    const block = (e: Event) => e.preventDefault();
    const keys = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && BLOCKED_KEYS.has(e.key.toLowerCase())) e.preventDefault();
    };
    const hide = () => setHidden(true);
    const show = () => setHidden(false);
    const visibility = () => setHidden(document.visibilityState === 'hidden');

    for (const type of ['contextmenu', 'dragstart', 'copy', 'cut']) area?.addEventListener(type, block);
    window.addEventListener('keydown', keys);
    window.addEventListener('blur', hide);
    window.addEventListener('focus', show);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      for (const type of ['contextmenu', 'dragstart', 'copy', 'cut']) area?.removeEventListener(type, block);
      window.removeEventListener('keydown', keys);
      window.removeEventListener('blur', hide);
      window.removeEventListener('focus', show);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [ref]);

  return { hidden };
}
