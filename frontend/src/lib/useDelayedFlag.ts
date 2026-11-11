import { useEffect, useState } from 'react';

/** True once `active` has stayed true for `delayMs`; false again as soon as it turns false. */
export function useDelayedFlag(active: boolean, delayMs = 150): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!active) {
      setOn(false);
      return;
    }
    const timer = setTimeout(() => setOn(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);
  return on;
}
