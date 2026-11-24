import { useEffect, useState } from 'react';

/**
 * Whether an element is on screen: attach the returned callback ref to it. `null` until the first observation (and
 * always when the browser has no IntersectionObserver), so callers can treat "unknown" as "show it".
 */
export function useInView<T extends Element>(): [(el: T | null) => void, boolean | null] {
  const [el, setEl] = useState<T | null>(null);
  const [inView, setInView] = useState<boolean | null>(null);
  useEffect(() => {
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) setInView(last.isIntersecting);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return [setEl, inView];
}
