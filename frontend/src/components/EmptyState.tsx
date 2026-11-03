import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** An empty list or page: a large icon and one sentence telling the user what to do next. */
export function EmptyState({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="empty">
      <Icon className="empty__icon" aria-hidden="true" strokeWidth={1.5} />
      <p className="empty__text">{children}</p>
    </div>
  );
}
