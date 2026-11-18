import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { useSite } from '../data/SiteContext';

export interface RouteTab {
  to: string;
  label: string;
  isCurrent: (pathname: string) => boolean;
}

/**
 * Underline tabs where each tab is its own route (links, so Back and new tabs work); the open one is underlined in
 * orchid. Admin only: on the public site (read-only) the pages share these components but show no tab row.
 */
export function RouteTabs({ label, tabs, children }: { label: string; tabs: RouteTab[]; children?: ReactNode }) {
  const { pathname } = useLocation();
  const { readOnly } = useSite();
  if (readOnly) return <>{children}</>;
  return (
    <div className="tabs">
      <nav className="tabs__list" aria-label={label}>
        {tabs.map((t) => (
          <Link key={t.to} className="tabs__tab" to={t.to} aria-current={t.isCurrent(pathname) ? 'page' : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="tabs__body">{children}</div>
    </div>
  );
}
