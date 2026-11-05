import { BookOpen, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { listNovels, type NovelStatus, type NovelSummary } from '../api/novels';
import { EmptyState } from '../components/EmptyState';
import { errorMessage, type ErrorMessage } from '../lib/errors';

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
      <header className="masthead masthead--row">
        <div>
          <h1 className="masthead__name">Novels</h1>
          <p className="masthead__lede">Translate novels from page screenshots and publish them chapter by chapter.</p>
        </div>
        <Link className="button button--primary" to="/novels/new">
          <Plus className="icon" aria-hidden="true" />
          New novel
        </Link>
      </header>

      {error && (
        <div className="alert" role="alert">
          <p className="alert__title">{error.title}</p>
          {error.hint && <p className="alert__hint">{error.hint}</p>}
        </div>
      )}

      <section className="history" aria-label="Novels">
        {novels === null ? (
          <p className="muted">Loading list…</p>
        ) : novels.length === 0 ? (
          <EmptyState icon={BookOpen}>No novels yet. Choose New novel to add the first one.</EmptyState>
        ) : (
          <ul className="novel-grid">
            {novels.map((n) => (
              <li key={n.id}>
                <Link className="novel-card" to={`/novels/${n.id}`}>
                  {n.coverUrl ? (
                    <img className="novel-card__cover" src={n.coverUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="novel-card__cover novel-card__cover--empty" aria-hidden="true">
                      <BookOpen className="icon" />
                    </span>
                  )}
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
