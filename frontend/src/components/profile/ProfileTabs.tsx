import { motion } from 'motion/react';
import { Link } from 'react-router';
import type { ProfileSummary } from '../../api/profiles';
import { pillTransition } from '../../lib/motion';

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
          {p.slug === current && <motion.span layoutId="ptab-pill" className="ptabs__pill" transition={pillTransition} />}
          <span className="ptabs__label">{p.displayName}</span>
        </Link>
      ))}
    </nav>
  );
}
