import { Link } from 'react-router';
import type { ProfileSummary } from '../../api/profiles';

/** Tabs EmiBonnie · Emi · Bonnie (underline tabs like the Vietsub pages); the open profile is the current page. */
export function ProfileTabs({ profiles, current }: { profiles: ProfileSummary[]; current: string }) {
  return (
    <nav className="tabs__list" aria-label="Profile">
      {profiles.map((p) => (
        <Link
          key={p.slug}
          className="tabs__tab"
          to={`/profiles/${p.slug}`}
          aria-current={p.slug === current ? 'page' : undefined}
        >
          {p.displayName}
        </Link>
      ))}
    </nav>
  );
}
