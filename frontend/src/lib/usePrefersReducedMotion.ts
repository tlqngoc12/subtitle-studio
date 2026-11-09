import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function matches(): boolean {
  try {
    return window.matchMedia?.(QUERY).matches ?? false;
  } catch {
    return false;
  }
}

/** True while the OS asks for reduced motion; follows changes of the setting. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(matches);
  useEffect(() => {
    let list: MediaQueryList | undefined;
    try {
      list = window.matchMedia?.(QUERY);
    } catch {
      return;
    }
    if (!list) return;
    const onChange = () => setReduced(matches());
    list.addEventListener?.('change', onChange);
    return () => list.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}
