import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router';
import { useSite } from '../data/SiteContext';
import { pillTransition } from '../lib/motion';
import { PublishButton } from './PublishButton';

interface Section {
  to: string;
  label: string;
  isCurrent: (pathname: string) => boolean;
}

/** The watch page (/vietsub/:id) belongs to the list it is opened from. */
const VIETSUB_LIST: Section = {
  to: '/vietsub/list',
  label: 'Vietsub list',
  isCurrent: (p) => /^\/vietsub\/[^/]+\/?$/.test(p) && !/^\/vietsub\/playlists\/?$/.test(p),
};
const PROFILE: Section = { to: '/profiles', label: 'Profile', isCurrent: (p) => p === '/profiles' || p.startsWith('/profiles/') };

const NOVELS: Section = { to: '/novels', label: 'Novels', isCurrent: (p) => p === '/novels' || p.startsWith('/novels/') };

/** Guests only read: no Get Engsub, no Vietsub management. */
const PUBLIC_SECTIONS: Section[] = [VIETSUB_LIST, PROFILE];

const ADMIN_SECTIONS: Section[] = [
  { to: '/', label: 'Get Engsub', isCurrent: (p: string) => p === '/' },
  // The playlist pages (/vietsub/playlists, /vietsub/playlists/:id) are part of managing Vietsub.
  { to: '/vietsub', label: 'Vietsub', isCurrent: (p: string) => /^\/vietsub(\/|\/playlists(\/.*)?)?$/.test(p) },
  VIETSUB_LIST,
  PROFILE,
  NOVELS,
];

/** Sticky top bar: app name (home link) and the main sections; the sections scroll sideways on narrow screens. */
export function NavBar() {
  const { pathname } = useLocation();
  const { readOnly, homePath } = useSite();
  const sections = readOnly ? PUBLIC_SECTIONS : ADMIN_SECTIONS;
  const navRef = useRef<HTMLElement>(null);

  // On a phone only part of the row fits: bring the current section into view.
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [pathname]);
  return (
    <header className="topbar">
      <div className="topbar__inner">
        <Link className="topbar__brand" to={homePath}>
          Subtitle Studio
        </Link>
        <nav className="nav" aria-label="Main" ref={navRef}>
          {sections.map((s) => {
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
        {!readOnly && <PublishButton />}
      </div>
    </header>
  );
}
