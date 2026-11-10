import { useEffect, useState } from 'react';

/** Phones and narrow windows. */
export const COMPACT_QUERY = '(max-width: 767px)';

function matches(query: string): boolean {
  try {
    return window.matchMedia?.(query).matches ?? false;
  } catch {
    return false;
  }
}

/** True while the media query matches; follows changes. */
export function useMediaQuery(query: string): boolean {
  const [value, setValue] = useState(() => matches(query));
  useEffect(() => {
    let list: MediaQueryList | undefined;
    try {
      list = window.matchMedia?.(query);
    } catch {
      return;
    }
    if (!list) return;
    const onChange = () => setValue(matches(query));
    onChange();
    list.addEventListener?.('change', onChange);
    return () => list.removeEventListener?.('change', onChange);
  }, [query]);
  return value;
}
