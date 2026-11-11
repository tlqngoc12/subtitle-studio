import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useSite } from '../data/SiteContext';
import { pillTransition } from '../lib/motion';
import { useScrollDirection } from '../lib/useScrollDirection';
import { useTopbarHeight } from '../lib/useTopbarHeight';
import { PublishButton } from './PublishButton';
import { useTopbarSlot } from './TopbarSlot';
import './NavBar.css';

interface Section {
  to: string;
  label: string;
  isCurrent: (pathname: string) => boolean;
}

/** The watch page (/vietsub/:id) belongs to the list it is opened from. */
const VIETSUB_LIST: Section = {
  to: '/vietsub/list',
  label: 'Vietsub list',
  isCurrent: (p) => /^\/vietsub\/[^/]+\/?$/.test(p) && !/^\/vietsub\/(playlists|profiles)\/?$/.test(p),
};
const PROFILE: Section = { to: '/profiles', label: 'Profile', isCurrent: (p) => p === '/profiles' || p.startsWith('/profiles/') };

const WORKS: Section = { to: '/works', label: 'Works', isCurrent: (p) => p === '/works' || p.startsWith('/works/') };

const PHOTOS: Section = { to: '/photos', label: 'Photos', isCurrent: (p) => p === '/photos' || p.startsWith('/photos/') };

const NOVELS: Section = { to: '/novels', label: 'Novels', isCurrent: (p) => p === '/novels' || p.startsWith('/novels/') };

/** Guests only read: no Get Engsub, no Vietsub management. */
const PUBLIC_SECTIONS: Section[] = [VIETSUB_LIST, PROFILE, WORKS, PHOTOS, NOVELS];

const ADMIN_SECTIONS: Section[] = [
  { to: '/', label: 'Get Engsub', isCurrent: (p: string) => p === '/' },
  // The playlist pages (/vietsub/playlists, /vietsub/playlists/:id) are part of managing Vietsub.
  { to: '/vietsub', label: 'Vietsub', isCurrent: (p: string) => /^\/vietsub(\/|\/playlists(\/.*)?|\/profiles\/?)?$/.test(p) },
  VIETSUB_LIST,
  PROFILE,
  WORKS,
  PHOTOS,
  NOVELS,
];

/**
 * Sticky top bar: app name (home link) and the main sections; the sections scroll sideways on narrow screens.
 * A page can replace those with its own controls through {@link useTopbarSlot} and slide the whole bar away.
 */
export function NavBar() {
  const { pathname } = useLocation();
  const { readOnly, homePath } = useSite();
  const sections = readOnly ? PUBLIC_SECTIONS : ADMIN_SECTIONS;
  const navRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const { setTarget, active, hidden } = useTopbarSlot();
  useTopbarHeight(barRef);
  // Keyboard focus inside the bar keeps it visible.
  const [focusIn, setFocusIn] = useState(false);
  const scroll = useScrollDirection({ locked: focusIn });
  const slideAway = hidden || (!active && scroll.hidden);

  // On a phone only part of the row fits: bring the current section into view.
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [pathname]);
  return (
    <header
      className={['topbar', slideAway && 'topbar--hidden', scroll.scrolled && 'topbar--scrolled'].filter(Boolean).join(' ')}
      ref={barRef}
      onFocus={() => setFocusIn(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocusIn(false);
      }}
    >
      <div className="topbar__inner">
        {/* A page (the chapter reader) may fill the slot; it then replaces the logo and the menu. */}
        <div className="topbar__slot" ref={setTarget} />
        {!active && (
          <>
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
          </>
        )}
      </div>
    </header>
  );
}
