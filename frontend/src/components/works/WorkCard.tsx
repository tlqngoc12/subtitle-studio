import { Clapperboard } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { WorkSummary } from '../../api/works';
import { formatDay } from '../../lib/dates';
import { CATEGORY_LABELS } from './categories';
import './WorkCard.css';

/**
 * One poster card; the whole card links to the work's page. `badge` is the profile's display name. `children` (the
 * admin Edit button) sits beside the link so it is never a link descendant.
 */
export function WorkCard({ work, badge, children }: { work: WorkSummary; badge: string | null; children?: ReactNode }) {
  return (
    <li className="work-card">
      <Link className="work-card__link" to={`/works/${work.id}`} state={{ fromWorks: true }} aria-label={work.title}>
        <span className="work-card__cover">
          {work.coverUrl ? (
            <img src={work.coverUrl} alt="" loading="lazy" />
          ) : (
            <span className="work-card__placeholder" aria-hidden="true">
              <Clapperboard className="icon" />
            </span>
          )}
          {badge && <span className="work-card__badge">{badge}</span>}
        </span>
        <span className="work-card__date">{work.releaseDate ? formatDay(work.releaseDate) : 'Coming Soon'}</span>
        <span className="work-card__title">{work.title}</span>
        <span className="work-card__chips">
          <span className="work-card__chip work-card__chip--category">{CATEGORY_LABELS[work.category]}</span>
          {work.subcategory && <span className="work-card__chip">{work.subcategory}</span>}
        </span>
      </Link>
      {children}
    </li>
  );
}
