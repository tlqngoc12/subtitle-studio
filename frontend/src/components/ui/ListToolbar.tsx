import { ArrowUpDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { FilterPills, type FilterOption } from './FilterPills';
import { SearchBar } from './SearchBar';
import { Select, type SelectOption } from './Select';
import { Toolbar } from './Toolbar';
import './ListToolbar.css';

/**
 * The toolbar of a card list (Fanfics, Translated novels, the public Truyện dịch tab): search, status pills, a sort
 * select with a small icon, then the tab's own actions on the right. The caller owns the state and the copy.
 */
export function ListToolbar<S extends string, K extends string>({
  searchLabel,
  searchPlaceholder,
  query,
  onQueryChange,
  statusLabel,
  statuses,
  status,
  onStatusChange,
  sortId,
  sortLabel,
  sorts,
  sort,
  onSortChange,
  actions,
  className,
}: {
  searchLabel: string;
  /** Says what the box searches ("Search by title, author…"); defaults to the label. */
  searchPlaceholder?: string;
  query: string;
  onQueryChange: (value: string) => void;
  statusLabel: string;
  statuses: readonly FilterOption<S>[];
  status: S;
  onStatusChange: (value: S) => void;
  /** Unique id of the sort control, so the hidden label names it. */
  sortId: string;
  sortLabel: string;
  sorts: readonly (SelectOption & { value: K })[];
  sort: K;
  onSortChange: (value: K) => void;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <Toolbar
      className={className}
      search={
        <SearchBar
          value={query}
          onChange={onQueryChange}
          label={searchLabel}
          placeholder={searchPlaceholder}
          onClear={() => onQueryChange('')}
        />
      }
      filters={
        <>
          <FilterPills label={statusLabel} options={statuses} value={status} onChange={onStatusChange} />
          <div className="list-toolbar__sort">
            <label className="visually-hidden" htmlFor={sortId}>
              {sortLabel}
            </label>
            <ArrowUpDown className="icon list-toolbar__sort-icon" aria-hidden="true" />
            <Select id={sortId} value={sort} onChange={(v) => onSortChange(v as K)} options={[...sorts]} />
          </div>
        </>
      }
      actions={actions}
    />
  );
}
