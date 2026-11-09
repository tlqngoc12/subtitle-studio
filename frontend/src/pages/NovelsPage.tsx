import { BookOpen, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { listNovels, type NovelStatus, type NovelSummary } from '../api/novels';
import { EmptyState } from '../components/EmptyState';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import { Alert } from '../components/ui/Alert';
import { LoadingText } from '../components/ui/LoadingText';
import { PageHeader } from '../components/ui/PageHeader';
import { Cover } from '../components/ui/Cover';
import './public/NovelCard.css';

export const STATUS_LABEL: Record<NovelStatus, string> = { ONGOING: 'Ongoing', COMPLETED: 'Completed' };

export function chapterCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'chapter' : 'chapters'}`;
}

/** Novels: one card per novel, newest change first. */
export default function NovelsPage() {
  const [novels, setNovels] = useState<NovelSummary[] | null>(null);
  const [error, setError] = useState<ErrorMessage | null>(null);

  useEffect(() => {
    listNovels()
      .then(setNovels)
      .catch((e) => {
        setNovels([]);
        setError(errorMessage(e));
      });
  }, []);

  return (
    <main className="page">
      <PageHeader
        title="Novels"
        lede="Translate novels from page screenshots and publish them chapter by chapter."
        actions={
          <Link className="button button--primary" to="/novels/new">
            <Plus className="icon" aria-hidden="true" />
            New novel
          </Link>
        }
      />

      {error && (
        <Alert title={error.title} hint={error.hint} />
      )}

      <section className="history" aria-label="Novels">
        {novels === null ? (
          <LoadingText>Loading list…</LoadingText>
        ) : novels.length === 0 ? (
          <EmptyState icon={BookOpen}>No novels yet. Choose New novel to add the first one.</EmptyState>
        ) : (
          <ul className="novel-grid">
            {novels.map((n) => (
              <li key={n.id}>
                <Link className="novel-card" to={`/novels/${n.id}`}>
                  <Cover src={n.coverUrl} lazy />
                  <span className="novel-card__body">
                    <span className="novel-card__title">{n.title}</span>
                    <span className="badge badge--info">{STATUS_LABEL[n.novelStatus]}</span>
                    <span className="meta">
                      {chapterCountLabel(n.chapterCount)} · {n.publishedCount} published
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
