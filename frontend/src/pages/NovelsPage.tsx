import { BookOpen, Plus, SearchX } from 'lucide-react';
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

/** Novels › Translated: one Fanfics-style card per novel with search, a status filter, a sort and a banner menu. */
export default function NovelsPage() {
  const [novels, setNovels] = useState<NovelSummary[] | null>(null);
  const [reads, setReads] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [tab, setTab] = useNovelsTab();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<NovelStatusFilter>('all');
  const [sort, setSort] = useState<NovelSort>('updated');

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

  const visible = useMemo(
    () => sortNovels(filterNovels(novels ?? [], query, status), sort, reads),
    [novels, query, status, sort, reads],
  );
  const pickedCount = (novels ?? []).filter((n) => n.featured).length;
  const replace = (updated: NovelSummary) =>
    setNovels((all) => (all ?? []).map((n) => (n.id === updated.id ? updated : n)));

  return (
    <Page>
      <PageHeader
        title="Novels"
        lede="Translate novels from page screenshots and publish them chapter by chapter."
      />

      <NovelsTabs
        tab={tab}
        onTabChange={setTab}
        translated={
          <section className="fanfics" aria-label="Novels">
            <ListToolbar
              searchLabel="Search novels"
              searchPlaceholder="Search by title, author, slug…"
              query={query}
              onQueryChange={setQuery}
              statusLabel="Status"
              statuses={STATUSES}
              status={status}
              onStatusChange={setStatus}
              sortId="novels-sort"
              sortLabel="Sort by"
              sorts={SORTS}
              sort={sort}
              onSortChange={setSort}
              actions={
                <Link className="button button--primary" to="/novels/new">
                  <Plus className="icon" aria-hidden="true" />
                  New novel
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
              !error && <EmptyState icon={BookOpen}>No novels yet. Choose New novel to add the first one.</EmptyState>
            ) : visible.length === 0 ? (
              <EmptyState icon={SearchX}>No novels match.</EmptyState>
            ) : (
              <ul className="fanfic-list" aria-label="Novel list">
                {visible.map((n, i) => (
                  <Reveal as="li" key={n.id} delayIndex={i} layout>
                    <NovelCard
                      admin
                      novel={n}
                      href={`/novels/${n.id}`}
                      reads={reads?.[n.slug]}
                      menu={<NovelMenu novel={n} pickedCount={pickedCount} onChange={replace} />}
                    />
                  </Reveal>
                ))}
              </ul>
            )}
          </section>
        }
      />
    </Page>
  );
}
