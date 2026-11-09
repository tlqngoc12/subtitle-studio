import { ChevronLeft, ChevronRight } from 'lucide-react';
import ReactPaginateModule from 'react-paginate';
import './Pagination.css';

// react-paginate ships a webpack UMD bundle whose component sits on `module.exports.default`.
// Vitest unwraps that, but the production Vite build hands us the whole exports object
// (React error #130), so take `.default` when it is there.
const ReactPaginate =
  (ReactPaginateModule as unknown as { default?: typeof ReactPaginateModule }).default ?? ReactPaginateModule;

interface Props {
  /** 1-based. */
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}

/** `‹ 1 2 3 … 8 ›` under a list; renders nothing when everything fits on one page. */
export function Pagination({ page, pageCount, onChange }: Props) {
  if (pageCount <= 1) return null;
  return (
    <ReactPaginate
      pageCount={pageCount}
      forcePage={page - 1}
      onPageChange={({ selected }) => onChange(selected + 1)}
      pageRangeDisplayed={3}
      marginPagesDisplayed={1}
      breakLabel="…"
      previousLabel={<ChevronLeft className="icon" aria-hidden="true" />}
      nextLabel={<ChevronRight className="icon" aria-hidden="true" />}
      previousAriaLabel="Previous page"
      nextAriaLabel="Next page"
      ariaLabelBuilder={(n) => `Page ${n}`}
      containerClassName="pager"
      pageLinkClassName="pager__link"
      previousLinkClassName="pager__link"
      nextLinkClassName="pager__link"
      breakLinkClassName="pager__break"
      activeLinkClassName="pager__link--active"
      disabledClassName="pager__item--disabled"
    />
  );
}
