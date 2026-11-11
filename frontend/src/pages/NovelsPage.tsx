import { BookOpen, Eye, Plus } from 'lucide-react';
import { Reveal } from '../components/ui/Reveal';
import { SkeletonGrid } from '../components/ui/Skeleton';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { listNovelReads, listNovels, type NovelStatus, type NovelSummary } from '../api/novels';
import { EmptyState } from '../components/EmptyState';
import { NovelsTabs, useNovelsTab } from '../components/fanfics/NovelsTabs';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import { Alert } from '../components/ui/Alert';
import { PageHeader } from '../components/ui/PageHeader';
import { Cover } from '../components/ui/Cover';
import './public/NovelCard.css';
import './public/ReadsMeta.css';

export const STATUS_LABEL: Record<NovelStatus, string> = { ONGOING: 'Ongoing', COMPLETED: 'Completed' };

export function chapterCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'chapter' : 'chapters'}`;
}

/** Novels: one card per novel, newest change first. */
export default function NovelsPage() {
  const [novels, setNovels] = useState<NovelSummary[] | null>(null);
  const [reads, setReads] = useState<Record<string, number>>({});
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

  return (
    <main className="page">
      <PageHeader
        title="Novels"
        lede="Translate novels from page screenshots and publish them chapter by chapter."
        actions={
          tab === 'translated' && (
            <Link className="button button--primary" to="/novels/new">
              <Plus className="icon" aria-hidden="true" />
              New novel
            </Link>
          )
        }
      />

      <NovelsTabs
        tab={tab}
        onTabChange={setTab}
        translated={
          <>
            {error && (
              <Alert title={error.title} hint={error.hint} />
            )}

            <section className="history" aria-label="Novels">
              {novels === null ? (
                <SkeletonGrid count={6} aspect="3/4" />
              ) : novels.length === 0 ? (
                <EmptyState icon={BookOpen}>No novels yet. Choose New novel to add the first one.</EmptyState>
              ) : (
                <ul className="novel-grid">
                  {novels.map((n, i) => (
                    <Reveal as="li" key={n.id} delayIndex={i} layout>
                      <Link className="novel-card" to={`/novels/${n.id}`}>
                        <Cover src={n.coverUrl} lazy />
                        <span className="novel-card__body">
                          <span className="novel-card__title">{n.title}</span>
                          <span className="badge badge--info">{STATUS_LABEL[n.novelStatus]}</span>
                          <span className="meta">
                            {chapterCountLabel(n.chapterCount)} · {n.publishedCount} published
                          </span>
                          <span className="meta reads-meta">
                            <Eye className="icon" aria-hidden="true" />
                            {reads[n.slug] === undefined ? '–' : `${reads[n.slug].toLocaleString('en-US')} reads`}
                          </span>
                        </span>
                      </Link>
                    </Reveal>
                  ))}
                </ul>
              )}
            </section>
          </>
        }
      />
    </main>
  );
}
