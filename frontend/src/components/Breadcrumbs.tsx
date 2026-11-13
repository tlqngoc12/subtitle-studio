import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Fragment, type MouseEvent } from 'react';
import { Link } from 'react-router';
import { useT } from '../lib/i18n';
import './Breadcrumbs.css';

export interface Crumb {
  label: string;
  /** Missing on the last crumb: it is the current page. */
  to?: string;
}

/**
 * `Novels › Title › Chapter`: every crumb but the last is a link; long labels are cut with an ellipsis (CSS).
 * Under 521 px only a "← parent" link is shown. `onNavigate` sees every link click first (a screen with unsaved
 * edits calls `preventDefault()` there and asks before leaving).
 */
export function Breadcrumbs({
  items,
  onNavigate,
}: {
  items: Crumb[];
  onNavigate?: (e: MouseEvent<HTMLAnchorElement>, to: string) => void;
}) {
  const t = useT();
  const parent = [...items].reverse().find((c) => c.to);
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {parent?.to && (
        <Link
          className="breadcrumbs__back"
          to={parent.to}
          aria-label={t(`Back to ${parent.label}`, `Quay lại ${parent.label}`)}
          onClick={(e) => onNavigate?.(e, parent.to!)}
        >
          <ChevronLeft className="icon icon--sm" aria-hidden="true" />
          <span className="breadcrumbs__label">{parent.label}</span>
        </Link>
      )}
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
                  <Link className="breadcrumbs__label" to={c.to} onClick={(e) => onNavigate?.(e, c.to!)}>
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
