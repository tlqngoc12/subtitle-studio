import { SearchX } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { Crumb } from '../Breadcrumbs';
import { EmptyState } from '../EmptyState';
import { PageHeader } from './PageHeader';

/**
 * The body of a page whose thing does not exist ("X not found", screen-layout.md section 7): breadcrumbs ending in
 * the parent list and "Not found", the H1, one sentence and a link back to the list. Render it inside `<Page>`.
 */
export function NotFoundState({
  title,
  crumbs,
  notFoundLabel = 'Not found',
  children,
  backTo,
  backLabel,
}: {
  title: string;
  /** The crumbs above the current page: the menu item and the list the thing belongs to. */
  crumbs: Crumb[];
  notFoundLabel?: string;
  children: ReactNode;
  backTo: string;
  backLabel: string;
}) {
  return (
    <>
      <PageHeader breadcrumbs={[...crumbs, { label: notFoundLabel }]} title={title} />
      <EmptyState icon={SearchX}>{children}</EmptyState>
      <p>
        <Link className="button" to={backTo}>
          {backLabel}
        </Link>
      </p>
    </>
  );
}
