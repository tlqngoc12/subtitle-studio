import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { chapterLabel, chapterName } from '../../components/novel/ChapterList';
import type { NovelSource } from '../../data/novelSource';
import type { PublicChapterFile, PublicNovelDetail } from '../../data/novelTypes';
import { useCopyGuard } from '../../lib/useCopyGuard';
import { errorMessage, type ErrorMessage } from '../../lib/errors';

/**
 * The public chapter reader: the chapter as drawn images (no text on the page), Previous / Next and a chapter
 * list, with the copy guards of {@link useCopyGuard}.
 */
export default function ReaderPage({ source }: { source: NovelSource }) {
  const { slug = '', chapterNo = '' } = useParams();
  const navigate = useNavigate();
  const selectId = useId();
  // On <main>, which is always rendered, so the guard's listeners attach on mount.
  const area = useRef<HTMLElement>(null);
  const { hidden } = useCopyGuard(area);
  const [novel, setNovel] = useState<PublicNovelDetail | null>(null);
  const [chapter, setChapter] = useState<PublicChapterFile | null>(null);
  const [error, setError] = useState<ErrorMessage | null>(null);

  useEffect(() => {
    source
      .getNovel(slug)
      .then(setNovel)
      .catch(() => {});
  }, [source, slug]);

  useEffect(() => {
    setChapter(null);
    setError(null);
    source
      .getChapter(slug, Number(chapterNo))
      .then((c) => {
        setChapter(c);
        area.current?.scrollIntoView?.({ block: 'start' });
      })
      .catch((e) => setError(errorMessage(e, { readOnly: true })));
  }, [source, slug, chapterNo]);

  const to = (no: number) => `/novels/${slug}/${no}`;

  function nav(position: string) {
    if (!chapter) return null;
    return (
      <nav className="reader__nav" aria-label={`Chapters (${position})`}>
        {chapter.prev !== null ? (
          <Link className="button button--primary" to={to(chapter.prev)} aria-label="Previous chapter">
            <ChevronLeft className="icon" aria-hidden="true" />
            <span aria-hidden="true">Previous</span>
          </Link>
        ) : (
          <span />
        )}
        {chapter.next !== null && (
          <Link className="button button--primary" to={to(chapter.next)} aria-label="Next chapter">
            <span aria-hidden="true">Next</span>
            <ChevronRight className="icon" aria-hidden="true" />
          </Link>
        )}
      </nav>
    );
  }

  return (
    <main ref={area} className="page reader-page">
      <Link className="back-link" to={`/novels/${slug}`}>
        <ArrowLeft className="icon" aria-hidden="true" />
        {novel?.title ?? 'Back to the novel'}
      </Link>
      {error && (
        <div className="alert" role="alert">
          <p className="alert__title">{error.title}</p>
        </div>
      )}
      {chapter && (
        <>
          <header className="reader__head">
            <h1 className="reader__title">{chapterLabel(chapter.chapterNo, chapter.title, chapter.label)}</h1>
            {novel && (
              <div className="field reader__select">
                <label htmlFor={selectId}>Chapter</label>
                <select id={selectId} value={chapter.chapterNo} onChange={(e) => navigate(to(Number(e.target.value)))}>
                  {novel.chapters.map((c) => (
                    <option key={c.chapterNo} value={c.chapterNo}>
                      {chapterLabel(c.chapterNo, c.title, c.label)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </header>
          {nav('top')}
          <div className={hidden ? 'reader reader--hidden' : 'reader'}>
            {chapter.images.map((src, i) => (
              <img
                key={src}
                className="reader__page"
                src={src}
                alt={`${chapterName(chapter.chapterNo, chapter.label)}, page ${i + 1} of ${chapter.images.length}`}
                draggable={false}
                loading="lazy"
              />
            ))}
            <div className="reader__shield" aria-hidden="true" />
          </div>
          <p className="visually-hidden" aria-live="polite">
            {hidden ? 'Content hidden while the window is inactive.' : ''}
          </p>
          <p className="reader-print-note">Printing is not available.</p>
          {nav('bottom')}
        </>
      )}
    </main>
  );
}
