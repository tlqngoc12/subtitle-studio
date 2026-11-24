import { useAdminTitle } from '../lib/useAdminTitle';
import { BookOpen, PenLine, Plus, SearchX } from 'lucide-react';
import { Reveal } from '../components/ui/Reveal';
import { Skeleton } from '../components/ui/Skeleton';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { listNovelReads, listNovels, type NovelStatus, type NovelSummary } from '../api/novels';
import { EmptyState } from '../components/EmptyState';
import { NovelsTabs, useNovelsTab } from '../components/fanfics/NovelsTabs';
import { NovelCard } from '../components/novel/NovelCard';
import { NovelMenu } from '../components/novel/NovelMenu';
import { ListToolbar } from '../components/ui/ListToolbar';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import {
  filterNovels,
  sortNovels,
  type NovelSort,
  type NovelStatusFilter,
} from '../lib/novelList';
import { Alert } from '../components/ui/Alert';
import { Page } from '../components/ui/Page';
import { PageHeader } from '../components/ui/PageHeader';
import '../components/fanfics/FanficsTab.css';

export const STATUS_LABEL: Record<NovelStatus, string> = { ONGOING: 'Ongoing', COMPLETED: 'Completed' };

export function chapterCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'chapter' : 'chapters'}`;
}

const STATUSES: { value: NovelStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'ongoing', label: 'Ongoing' },
];

const SORTS: { value: NovelSort; label: string }[] = [
  { value: 'updated', label: 'Newest update' },
  { value: 'read', label: 'Most read' },
  { value: 'added', label: 'Recently added' },
  { value: 'title', label: 'Title A–Z' },
];

/** Novels: Translated and Originals share one card list (search, a status filter, a sort and a banner menu). */
export default function NovelsPage() {
  useAdminTitle('Novels');
  const [novels, setNovels] = useState<NovelSummary[] | null>(null);
  const [reads, setReads] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [tab, setTab] = useNovelsTab();

  useEffect(() => {
    listNovels()
      .then(setNovels)
      .catch((e) => {
        setNovels([]);
        setError(errorMessage(e));
      });
  }, []);

  useEffect(() => {
    void listNovelReads().then(setReads);
  }, []);

  const pickedCount = (novels ?? []).filter((n) => n.featured).length;
  const replace = (updated: NovelSummary) =>
    setNovels((all) => (all ?? []).map((n) => (n.id === updated.id ? updated : n)));
  const list = (original: boolean) => (
    <NovelList
      original={original}
      novels={novels === null ? null : novels.filter((n) => (n.sourceType === 'ORIGINAL') === original)}
      reads={reads}
      error={error}
      pickedCount={pickedCount}
      onChange={replace}
    />
  );

  return (
    <Page>
      <PageHeader
        title="Novels"
        lede="Translate novels from page screenshots, or write your own stories, and publish them chapter by chapter."
      />

      <NovelsTabs tab={tab} onTabChange={setTab} translated={list(false)} originals={list(true)} />
    </Page>
  );
}

/** One tab's list; `novels` is null while loading. Originals have their own action, texts and empty state. */
function NovelList({
  original,
  novels,
  reads,
  error,
  pickedCount,
  onChange,
}: {
  original: boolean;
  novels: NovelSummary[] | null;
  reads: Record<string, number> | null;
  error: ErrorMessage | null;
  pickedCount: number;
  onChange: (updated: NovelSummary) => void;
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<NovelStatusFilter>('all');
  const [sort, setSort] = useState<NovelSort>('updated');
  const visible = useMemo(
    () => sortNovels(filterNovels(novels ?? [], query, status), sort, reads),
    [novels, query, status, sort, reads],
  );

  return (
    <section className="fanfics" aria-label={original ? 'Stories' : 'Novels'}>
      <ListToolbar
        searchLabel={original ? 'Search stories' : 'Search novels'}
        searchPlaceholder="Search by title, author, slug…"
        query={query}
        onQueryChange={setQuery}
        statusLabel="Status"
        statuses={STATUSES}
        status={status}
        onStatusChange={setStatus}
        sortId={original ? 'originals-sort' : 'novels-sort'}
        sortLabel="Sort by"
        sorts={SORTS}
        sort={sort}
        onSortChange={setSort}
        actions={
          <Link className="button button--primary" to={original ? '/novels/new?kind=original' : '/novels/new'}>
            <Plus className="icon" aria-hidden="true" />
            {original ? 'New story' : 'New novel'}
          </Link>
        }
      />
      {error && <Alert title={error.title} hint={error.hint} />}

      {novels === null ? (
        <div className="fanfic-list" role="status" aria-busy="true" aria-label="Loading">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height="204px" radius="var(--radius-frame)" />
          ))}
        </div>
      ) : novels.length === 0 ? (
        !error && (
          <EmptyState icon={original ? PenLine : BookOpen}>
            {original
              ? 'No stories yet. Choose New story to write the first one.'
              : 'No novels yet. Choose New novel to add the first one.'}
          </EmptyState>
        )
      ) : visible.length === 0 ? (
        <EmptyState icon={SearchX}>{original ? 'No stories match.' : 'No novels match.'}</EmptyState>
      ) : (
        <ul className="fanfic-list" aria-label={original ? 'Story list' : 'Novel list'}>
          {visible.map((n, i) => (
            <Reveal as="li" key={n.id} delayIndex={i} layout>
              <NovelCard
                admin
                novel={n}
                href={`/novels/${n.id}`}
                reads={reads?.[n.slug]}
                menu={<NovelMenu novel={n} pickedCount={pickedCount} onChange={onChange} />}
              />
            </Reveal>
          ))}
        </ul>
      )}
    </section>
  );
}
