import type { MouseEvent, ReactNode } from 'react';
import { Breadcrumbs, type Crumb } from '../Breadcrumbs';
import './PageHeader.css';

/**
 * The page title block: breadcrumbs (level 2 and deeper), the visible H1, an optional lede, and the page's actions
 * on the right (40 px buttons, the primary one last).
 *
 * - `default`: text and actions in one row.
 * - `hero`: detail page with a cover (`media`) on the left; `meta` (chips, status badges) sits under the H1.
 * - `media`: Watch and Reader. The H1 sits below the player, so the page renders `<Breadcrumbs>` itself at the top.
 */
export function PageHeader({
  title,
  lede,
  actions,
  className,
  breadcrumbs,
  variant = 'default',
  media,
  meta,
  onNavigate,
}: {
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  className?: string;
  breadcrumbs?: Crumb[];
  variant?: 'default' | 'hero' | 'media';
  media?: ReactNode;
  meta?: ReactNode;
  onNavigate?: (e: MouseEvent<HTMLAnchorElement>, to: string) => void;
}) {
  const text = (
    <div className="masthead__text">
      <h1 className="masthead__name">{title}</h1>
      {meta && <div className="masthead__meta">{meta}</div>}
      {lede && <p className="masthead__lede">{lede}</p>}
    </div>
  );
  const actionsBox = actions ? <div className="masthead__actions">{actions}</div> : null;
  const classes = ['masthead', actions ? 'masthead--row' : '', variant === 'default' ? '' : `masthead--${variant}`, className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <>
      {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} onNavigate={onNavigate} />}
      <header className={classes}>
        {variant === 'hero' && media && <div className="masthead__media">{media}</div>}
        {variant === 'hero' ? (
          <div className="masthead__body">
            {text}
            {actionsBox}
          </div>
        ) : (
          <>
            {text}
            {actionsBox}
          </>
        )}
      </header>
    </>
  );
}
