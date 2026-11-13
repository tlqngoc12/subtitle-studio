import type { ReactNode } from 'react';
import './Toolbar.css';

/**
 * The row under the header (or the tabs) of a list screen: search, then filters and sort, then the tab's own
 * actions pushed to the right. A plain `div` on purpose: it holds inputs, so it gets no ARIA role.
 */
export function Toolbar({
  search,
  filters,
  actions,
  className,
  'aria-label': ariaLabel,
}: {
  search?: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <div className={className ? `toolbar ${className}` : 'toolbar'} aria-label={ariaLabel}>
      {search && <div className="toolbar__search">{search}</div>}
      {filters && <div className="toolbar__filters">{filters}</div>}
      {actions && <div className="toolbar__actions">{actions}</div>}
    </div>
  );
}
