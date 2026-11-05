import { BookOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { EmptyState } from '../../components/EmptyState';
import type { NovelSource } from '../../data/novelSource';
import type { PublicNovelSummary } from '../../data/novelTypes';
import { errorMessage, type ErrorMessage } from '../../lib/errors';
import { STATUS_LABEL, chapterCountLabel } from '../NovelsPage';

/** Public Novels: one card per novel that has a published chapter. */
export default function PublicNovelsPage({ source }: { source: NovelSource }) {
  const [novels, setNovels] = useState<PublicNovelSummary[] | null>(null);
  const [error, setError] = useState<ErrorMessage | null>(null);

  useEffect(() => {
    source
      .listNovels()
      .then(setNovels)
      .catch((e) => {
        setNovels([]);
        setError(errorMessage(e, { readOnly: true }));
      });
  }, [source]);

  return (
    <main className="page">
      <header className="masthead">
        <h1 className="masthead__name">Novels</h1>
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
          <EmptyState icon={BookOpen}>No novels yet. Check back soon.</EmptyState>
        ) : (
          <ul className="novel-grid">
            {novels.map((n) => (
              <li key={n.slug}>
                <Link className="novel-card" to={`/novels/${n.slug}`}>
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
                    <span className="meta">{chapterCountLabel(n.publishedCount)}</span>
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
