import type { ReactNode } from 'react';
import { RouteTabs, type RouteTab } from './RouteTabs';

const TABS: RouteTab[] = [
  { to: '/', label: 'Get Engsub', isCurrent: (p) => p === '/' },
  { to: '/vietsub', label: 'Videos', isCurrent: (p) => p === '/vietsub' || p === '/vietsub/' },
  { to: '/vietsub/playlists', label: 'Playlists', isCurrent: (p) => p.startsWith('/vietsub/playlists') },
  { to: '/vietsub/profiles', label: 'Profiles', isCurrent: (p) => p.startsWith('/vietsub/profiles') },
  { to: '/vietsub/list', label: 'List', isCurrent: (p) => p === '/vietsub/list' || p === '/vietsub/list/' },
];

/** Get Engsub · Videos · Playlists · Profiles · List: the tab row of the Vietsub group (admin only). */
export function VietsubTabs({ children }: { children?: ReactNode }) {
  return (
    <RouteTabs label="Vietsub" tabs={TABS}>
      {children}
    </RouteTabs>
  );
}
