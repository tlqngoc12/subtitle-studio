import { Link } from 'react-router';
import type { ProfileSummary } from '../../api/profiles';

/** Tabs EmiBonnie · Emi · Bonnie; the open profile is marked as the current page. */
export function ProfileTabs({ profiles, current }: { profiles: ProfileSummary[]; current: string }) {
  return (
    <nav className="ptabs" aria-label="Profile">
      {profiles.map((p) => (
        <Link
          key={p.slug}
          className="ptabs__link"
          to={`/profiles/${p.slug}`}
          aria-current={p.slug === current ? 'page' : undefined}
        >
          {p.displayName}
        </Link>
      ))}
    </nav>
  );
}
