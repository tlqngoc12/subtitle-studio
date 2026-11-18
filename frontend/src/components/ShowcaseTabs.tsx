import type { ReactNode } from 'react';
import { RouteTabs, type RouteTab } from './RouteTabs';

const TABS: RouteTab[] = [
  { to: '/profiles', label: 'Profile', isCurrent: (p) => p === '/profiles' || p.startsWith('/profiles/') },
  { to: '/works', label: 'Works', isCurrent: (p) => p === '/works' || p.startsWith('/works/') },
  { to: '/photos', label: 'Photos', isCurrent: (p) => p === '/photos' || p.startsWith('/photos/') },
];

/** Profile · Works · Photos: the tab row of the Showcase group (admin only). */
export function ShowcaseTabs({ children }: { children?: ReactNode }) {
  return (
    <RouteTabs label="Showcase" tabs={TABS}>
      {children}
    </RouteTabs>
  );
}
