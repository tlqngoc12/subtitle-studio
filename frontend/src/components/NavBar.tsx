import { motion } from 'motion/react';
import { Link, useLocation } from 'react-router';
import { pillTransition } from '../lib/motion';

const SECTIONS = [
  { to: '/', label: 'Get Engsub', isCurrent: (p: string) => p === '/' },
  // The playlist pages (/vietsub/playlists, /vietsub/playlists/:id) are part of managing Vietsub.
  { to: '/vietsub', label: 'Vietsub', isCurrent: (p: string) => /^\/vietsub(\/|\/playlists(\/.*)?)?$/.test(p) },
  // The watch page (/vietsub/:id) belongs to the list it is opened from.
  {
    to: '/vietsub/list',
    label: 'Vietsub list',
    isCurrent: (p: string) => /^\/vietsub\/[^/]+\/?$/.test(p) && !/^\/vietsub\/playlists\/?$/.test(p),
  },
  { to: '/profiles', label: 'Profile', isCurrent: (p: string) => p === '/profiles' || p.startsWith('/profiles/') },
];

/** Sticky top bar: app name (home link) and the main sections; the sections scroll sideways on narrow screens. */
export function NavBar() {
  const { pathname } = useLocation();
  return (
    <header className="topbar">
      <div className="topbar__inner">
        <Link className="topbar__brand" to="/">
          Subtitle Studio
        </Link>
        <nav className="nav" aria-label="Main">
          {SECTIONS.map((s) => {
            const current = s.isCurrent(pathname);
            return (
              <Link key={s.to} className="nav__link" to={s.to} aria-current={current ? 'page' : undefined}>
                {/* One pill shared by all links: it slides to the section just opened. */}
                {current && <motion.span layoutId="nav-pill" className="nav__pill" transition={pillTransition} />}
                <span className="nav__label">{s.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
