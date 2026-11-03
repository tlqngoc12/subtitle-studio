import { Link, useLocation } from 'react-router';

const SECTIONS = [
  { to: '/', label: 'Lấy Engsub', isCurrent: (p: string) => p === '/' },
  { to: '/vietsub', label: 'Vietsub', isCurrent: (p: string) => p === '/vietsub' || p === '/vietsub/' },
  // The watch page (/vietsub/:id) belongs to the list it is opened from.
  { to: '/vietsub/list', label: 'Danh sách Vietsub', isCurrent: (p: string) => /^\/vietsub\/[^/]+\/?$/.test(p) },
  { to: '/profiles', label: 'Profile', isCurrent: (p: string) => p === '/profiles' || p.startsWith('/profiles/') },
];

export function NavBar() {
  const { pathname } = useLocation();
  return (
    <nav className="nav" aria-label="Chính">
      {SECTIONS.map((s) => (
        <Link key={s.to} className="nav__link" to={s.to} aria-current={s.isCurrent(pathname) ? 'page' : undefined}>
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
