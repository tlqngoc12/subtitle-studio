import { useEffect } from 'react';
import { useSite } from '../data/SiteContext';

export const ADMIN_SITE_NAME = 'Subtitle Studio';

/**
 * The browser tab title of an admin page: "<page> · Subtitle Studio", with "● " in front while the page has unsaved
 * changes, so a tab with work in it can be told apart. Ignored on the public site (see `useDocumentTitle` there) and
 * while `title` is null (still loading); the previous title comes back when the page closes.
 */
export function useAdminTitle(title: string | null | undefined, dirty = false) {
  const { readOnly } = useSite();
  useEffect(() => {
    if (readOnly || !title) return;
    const previous = document.title;
    document.title = `${dirty ? '● ' : ''}${title} · ${ADMIN_SITE_NAME}`;
    return () => {
      document.title = previous;
    };
  }, [readOnly, title, dirty]);
}
