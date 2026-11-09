import { useEffect, type RefObject } from 'react';

/** Publishes the element's real height as `--topbar-h` so sticky elements can sit right under the top bar. */
export function useTopbarHeight(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const apply = () => root.style.setProperty('--topbar-h', `${el.getBoundingClientRect().height}px`);
    apply();
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(apply);
      observer.observe(el);
    }
    return () => {
      observer?.disconnect();
      root.style.removeProperty('--topbar-h');
    };
  }, [ref]);
}
