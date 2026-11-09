import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { ProfileSummary } from '../../api/profiles';

/** Tabs EmiBonnie · Emi · Bonnie (underline tabs like the Vietsub pages); the open profile is the current page. */
export function ProfileTabs({ profiles, current, children }: { profiles: ProfileSummary[]; current: string; children?: ReactNode }) {
  return (
    <div className="tabs">
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
      <div className="tabs__body">{children}</div>
    </div>
  );
}
