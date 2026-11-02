import { NavLink } from 'react-router';

export function NavBar() {
  return (
    <nav className="nav" aria-label="Chính">
      <NavLink className="nav__link" to="/" end>
        Lấy Engsub
      </NavLink>
      <NavLink className="nav__link" to="/vietsub">
        Vietsub
      </NavLink>
    </nav>
  );
}
