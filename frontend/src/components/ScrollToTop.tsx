import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router';

/**
 * A new page opens at the top. React Router keeps the scroll position when the route changes, so a page
 * opened from far down another one (e.g. Watch video at the bottom of "Fetched earlier") would show a blank area.
 *
 * Scrolls to the top on a PUSH or REPLACE to a different pathname. Back / Forward (POP) are left to the browser,
 * which restores the old position; query-only changes (?tab=, ?q=, ?page=) and #hash links stay where they are.
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const type = useNavigationType();
  const previous = useRef(pathname);

  useEffect(() => {
    const changed = previous.current !== pathname;
    previous.current = pathname;
    if (changed && type !== 'POP' && hash === '') window.scrollTo(0, 0);
  }, [pathname, hash, type]);

  return null;
}
