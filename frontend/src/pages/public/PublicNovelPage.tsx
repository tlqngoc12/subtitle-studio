import { BookOpen, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { chapterLabel } from '../../components/novel/ChapterList';
import type { NovelSource } from '../../data/novelSource';
import type { PublicNovelDetail } from '../../data/novelTypes';
import { errorMessage, type ErrorMessage } from '../../lib/errors';
import { STATUS_LABEL } from '../NovelsPage';

/** A novel's public page: cover, the eight fields (description as plain text) and its published chapters. */
export default function PublicNovelPage({ source }: { source: NovelSource }) {
  const { slug = '' } = useParams();
  const [novel, setNovel] = useState<PublicNovelDetail | null>(null);
  const [error, setError] = useState<ErrorMessage | null>(null);

  useEffect(() => {
    setNovel(null);
    setError(null);
    source
      .getNovel(slug)
      .then(setNovel)
      .catch((e) => setError(errorMessage(e, { readOnly: true })));
  }, [source, slug]);

  if (error) {
    return (
      <main className="page">
        <div className="alert" role="alert">
          <p className="alert__title">{error.title}</p>
          <Link to="/novels">Back to Novels</Link>
        </div>
      </main>
    );
  }
  if (!novel) {
    return (
      <main className="page">
        <p className="muted">Loading novel…</p>
      </main>
    );
  }

  const first = novel.chapters[0];
  return (
    <main className="page">
      <header className="novel-hero">
        {novel.coverUrl ? (
          <img className="novel-hero__cover" src={novel.coverUrl} alt="" />
        ) : (
          <span className="novel-hero__cover novel-card__cover--empty" aria-hidden="true">
            <BookOpen className="icon" />
          </span>
        )}
        <div className="novel-hero__text">
          <h1 className="masthead__name">{novel.title}</h1>
          <dl className="novel-facts">
            {novel.originalAuthor && (
              <div>
                <dt>Author</dt>
                <dd>{novel.originalAuthor}</dd>
              </div>
            )}
            <div>
              <dt>Status</dt>
              <dd>{STATUS_LABEL[novel.novelStatus]}</dd>
            </div>
            {novel.translatorCredit && (
              <div>
                <dt>Translation</dt>
                <dd>{novel.translatorCredit}</dd>
              </div>
            )}
          </dl>
          {novel.tags.length > 0 && (
            <ul className="tag-list" aria-label="Tags">
              {novel.tags.map((t) => (
                <li key={t} className="badge badge--info">
                  {t}
                </li>
              ))}
            </ul>
          )}
          <div className="novel-hero__actions">
            {first && (
              <Link className="button button--primary" to={`/novels/${novel.slug}/${first.chapterNo}`}>
                Read chapter {first.chapterNo}
              </Link>
            )}
            {novel.sourceUrl && (
              <a className="button button--small" href={novel.sourceUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="icon" aria-hidden="true" />
                Original book
              </a>
            )}
          </div>
        </div>
      </header>

      {novel.description && <p className="novel-description">{novel.description}</p>}

      <h2 className="history__heading">Chapters</h2>
      <ol className="chapter-list" aria-label="Chapters">
        {novel.chapters.map((c) => (
          <li key={c.chapterNo} className="chapter-list__item">
            <Link className="chapter-list__open" to={`/novels/${novel.slug}/${c.chapterNo}`}>
              {chapterLabel(c.chapterNo, c.title)}
            </Link>
          </li>
        ))}
      </ol>
    </main>
  );
}
