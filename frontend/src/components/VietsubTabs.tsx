import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';

const TABS = [
  { to: '/vietsub', label: 'Videos', isCurrent: (p: string) => p === '/vietsub' || p === '/vietsub/' },
  { to: '/vietsub/playlists', label: 'Playlists', isCurrent: (p: string) => p.startsWith('/vietsub/playlists') },
  { to: '/vietsub/profiles', label: 'Profiles', isCurrent: (p: string) => p.startsWith('/vietsub/profiles') },
];

/**
 * Videos · Playlists · Profiles under the Vietsub heading. Each is its own page (links, so Back and new tabs work),
 * drawn as the same underline tabs as the Vietsub list page; the open one is underlined in orchid.
 */
export function VietsubTabs({ children }: { children?: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="tabs">
      <nav className="tabs__list" aria-label="Vietsub">
        {TABS.map((t) => (
          <Link
            key={t.to}
            className="tabs__tab"
            to={t.to}
            aria-current={t.isCurrent(pathname) ? 'page' : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="tabs__body">{children}</div>
    </div>
  );
}
