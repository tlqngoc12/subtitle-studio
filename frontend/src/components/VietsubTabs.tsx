import { motion } from 'motion/react';
import { Link, useLocation } from 'react-router';
import { pillTransition } from '../lib/motion';

const TABS = [
  { to: '/vietsub', label: 'Videos', isCurrent: (p: string) => p === '/vietsub' || p === '/vietsub/' },
  { to: '/vietsub/playlists', label: 'Playlists', isCurrent: (p: string) => p.startsWith('/vietsub/playlists') },
];

/** Videos · Playlists under the Vietsub heading; same look as the profile tabs. */
export function VietsubTabs() {
  const { pathname } = useLocation();
  return (
    <nav className="ptabs" aria-label="Vietsub">
      {TABS.map((t) => {
        const current = t.isCurrent(pathname);
        return (
          <Link key={t.to} className="ptabs__link" to={t.to} aria-current={current ? 'page' : undefined}>
            {current && <motion.span layoutId="vtab-pill" className="ptabs__pill" transition={pillTransition} />}
            <span className="ptabs__label">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
