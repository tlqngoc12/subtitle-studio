import { ChevronRight } from 'lucide-react';
import { Fragment } from 'react';
import { Link } from 'react-router';

export interface Crumb {
  label: string;
  /** Missing on the last crumb: it is the current page. */
  to?: string;
}

/** `Novels › Title › Chapter`: every crumb but the last is a link; long labels are cut with an ellipsis (CSS). */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol className="breadcrumbs__list">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <Fragment key={i}>
              <li className={last ? 'breadcrumbs__item breadcrumbs__item--current' : 'breadcrumbs__item'}>
                {last || !c.to ? (
                  <span className="breadcrumbs__label" aria-current={last ? 'page' : undefined}>
                    {c.label}
                  </span>
                ) : (
                  <Link className="breadcrumbs__label" to={c.to}>
                    {c.label}
                  </Link>
                )}
              </li>
              {!last && (
                <li className="breadcrumbs__sep" aria-hidden="true">
                  <ChevronRight className="icon icon--sm" aria-hidden="true" />
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
