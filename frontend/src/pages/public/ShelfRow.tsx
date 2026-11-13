import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Cover } from '../../components/ui/Cover';
import type { PublicNovelSummary } from '../../data/novelTypes';
import { readProgress } from './readerPrefs';
import './ShelfRow.css';

/** Width of one item and the gap between items, in px; the CSS uses the same numbers. */
export const SHELF_ITEM_WIDTH = 200;
export const SHELF_GAP = 12;

/** How many items of `SHELF_ITEM_WIDTH` fit in `width` with `SHELF_GAP` between them (at least one). */
export function fitCount(width: number): number {
  return Math.max(1, Math.floor((width + SHELF_GAP) / (SHELF_ITEM_WIDTH + SHELF_GAP)));
}

/**
 * Tủ sách on the public Novels page: ONE row of compact items. Only the items that fit the row's width are rendered,
 * so the others can be neither seen nor reached by Tab or a screen reader; "Xem tất cả (N)" opens the full shelf.
 * Renders nothing when the shelf is empty.
 */
export function ShelfRow({ novels }: { novels: PublicNovelSummary[] }) {
  const listRef = useRef<HTMLUListElement>(null);
  // null = not measured yet (or no ResizeObserver): show everything, the CSS still keeps it to one row.
  const [fit, setFit] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const initial = el.getBoundingClientRect().width;
    if (initial > 0) setFit(fitCount(initial));
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[entries.length - 1]?.contentRect.width ?? 0;
      if (width > 0) setFit(fitCount(width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [novels.length]);

  if (novels.length === 0) return null;
  const shown = fit === null ? novels : novels.slice(0, fit);
  return (
    <section className="history shelf-row" aria-labelledby="shelf-heading">
      <div className="section-head">
        <h2 className="history__heading" id="shelf-heading">
          Tủ sách
        </h2>
        <Link to="/novels/shelf">Xem tất cả ({novels.length})</Link>
      </div>
      <ul className="shelf-row__list" ref={listRef}>
        {shown.map((n) => {
          const progress = readProgress(n.slug);
          return (
            <li key={n.slug} className="shelf-row__item">
              <Link className="shelf-row__link" to={`/novels/${n.slug}`}>
                <Cover src={n.coverUrl} className="shelf-row__cover" lazy />
                <span className="shelf-row__text">
                  <span className="shelf-row__title">{n.title}</span>
                  {progress != null && <span className="shelf-row__meta">Đang đọc Chương {progress}</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
