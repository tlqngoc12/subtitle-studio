import { useEffect } from 'react';

/**
 * While the player fills the viewport (iPhone Safari), drop `viewport-fit=cover` from the viewport meta so
 * Safari letterboxes the page into the safe area. YouTube's in-iframe player offsets its video by the
 * safe-area inset, which off-centres it when the page covers the whole screen. The original content is
 * restored on leaving filled mode or on unmount.
 */
export function useFilledViewport(filled: boolean) {
  useEffect(() => {
    if (!filled) return;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return;
    const original = meta.getAttribute('content') ?? '';
    const next = original
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part && !/^viewport-fit\s*=/i.test(part))
      .join(', ');
    meta.setAttribute('content', next);
    return () => meta.setAttribute('content', original);
  }, [filled]);
}
