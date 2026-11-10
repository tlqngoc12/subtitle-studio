import { useCallback, useState } from 'react';

const KEY = 'subtitle-studio.vietsub-captions';

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off'; // shown unless turned off
  } catch {
    return true;
  }
}

/** Whether the Vietsub overlay is shown on the watch page; the choice is remembered in localStorage. */
export function useCaptionsPref(): [boolean, () => void] {
  const [on, setOn] = useState(read);
  const toggle = useCallback(() => {
    setOn((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(KEY, next ? 'on' : 'off');
      } catch {
        // private window or blocked storage: the choice lasts until the page is closed
      }
      return next;
    });
  }, []);
  return [on, toggle];
}
