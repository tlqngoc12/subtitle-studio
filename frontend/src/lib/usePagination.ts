import { useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { paginate, parsePage } from './pagination';

/**
 * Client-side pagination with the page kept in `?page=` (absent on page 1), so Back from a
 * video returns to the same page. `items` is null while loading.
 */
export function usePagination<T>(items: T[] | null) {
  const [params, setParams] = useSearchParams();
  const requested = parsePage(params.get('page'));
  const { page, pageCount, items: pageItems } = paginate(items ?? [], requested);

  const setPage = useCallback(
    (next: number, options?: { replace?: boolean }) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next <= 1) p.delete('page');
          else p.set('page', String(next));
          return p;
        },
        options,
      ),
    [setParams],
  );

  // Keep the URL in step when the list no longer reaches the requested page,
  // e.g. after deleting the only video on the last page.
  const outOfRange = items !== null && page !== requested;
  useEffect(() => {
    if (outOfRange) setPage(page, { replace: true });
  }, [outOfRange, page, setPage]);

  return { items: items === null ? null : pageItems, page, pageCount, setPage };
}
