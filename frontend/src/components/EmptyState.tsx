import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import './EmptyState.css';

/** An empty list or page: a large icon and one sentence telling the user what to do next. */
export function EmptyState({
  icon: Icon,
  children,
  compact,
}: {
  icon: LucideIcon;
  children: ReactNode;
  /** Less padding, for a small panel such as a popover. */
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'empty empty--compact' : 'empty'}>
      <Icon className="empty__icon" aria-hidden="true" strokeWidth={1.5} />
      <p className="empty__text">{children}</p>
    </div>
  );
}
