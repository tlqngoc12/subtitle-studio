import { useEffect, useRef } from 'react';
import { centredScrollLeft } from '../components/NavBar';

/** The tab that is open: a link tab has aria-current, a Radix tab has data-state="active". */
const OPEN_TAB = '[aria-current="page"], [data-state="active"]';

/**
 * Attach the returned ref to a `.tabs__list`. On a phone the row scrolls sideways: this centres the open tab (also
 * when the tab changes) and sets `data-fade-start` / `data-fade-end` so the stylesheet fades only the edges that hide
 * more tabs. Uses an explicit scrollLeft like the NavBar, not scrollIntoView.
 */
export function useScrollableTabs<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const list = ref.current;
    if (!list) return;
    const updateFades = () => {
      list.dataset.fadeStart = String(list.scrollLeft > 1);
      list.dataset.fadeEnd = String(list.scrollLeft < list.scrollWidth - list.clientWidth - 1);
    };
    const centre = () => {
      const open = list.querySelector<HTMLElement>(OPEN_TAB);
      if (open) list.scrollLeft = centredScrollLeft(open, list);
      updateFades();
    };
    centre();
    list.addEventListener('scroll', updateFades, { passive: true });
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(centre);
    resize?.observe(list);
    const changes = new MutationObserver(centre);
    changes.observe(list, { subtree: true, attributes: true, attributeFilter: ['aria-current', 'data-state'] });
    return () => {
      list.removeEventListener('scroll', updateFades);
      resize?.disconnect();
      changes.disconnect();
    };
  }, []);
  return ref;
}
