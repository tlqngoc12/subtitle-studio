import { ArrowLeft, ChevronLeft, ChevronRight, Moon, Sun } from 'lucide-react';
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { NovelSource } from '../../data/novelSource';
import type { PublicChapterFile, PublicNovelDetail } from '../../data/novelTypes';
import { useCopyGuard } from '../../lib/useCopyGuard';
import { PUBLIC_ERROR_TITLE, publicChapterLabel, publicChapterName, useDocumentTitle } from './publicNames';
import {
  READER_WIDTHS,
  isDarkTheme,
  readNight,
  readWidth,
  recordProgress,
  saveNight,
  saveWidth,
  type ReaderWidth,
} from './readerPrefs';

/**
 * The public chapter reader: the chapter as drawn images (no text on the page), one toolbar (previous, chapter list,
 * next), a next-chapter card at the end and the copy guards of {@link useCopyGuard}. Copy is Vietnamese.
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
  const [failed, setFailed] = useState(false);
  // Night mode: the reader's own choice, else on exactly when the app theme is dark.
  const [night, setNight] = useState(() => readNight() ?? isDarkTheme());
  const [width, setWidth] = useState<ReaderWidth>(readWidth);
  const widthStep = READER_WIDTHS.indexOf(width);

  function toggleNight() {
    saveNight(!night);
    setNight(!night);
  }

  function stepWidth(delta: number) {
    const next = READER_WIDTHS[widthStep + delta];
    if (next === undefined) return;
    saveWidth(next);
    setWidth(next);
  }

  useEffect(() => {
    source
      .getNovel(slug)
      .then(setNovel)
      .catch(() => {});
  }, [source, slug]);

  useEffect(() => {
    setChapter(null);
    setFailed(false);
    source
      .getChapter(slug, Number(chapterNo))
      .then((c) => {
        setChapter(c);
        area.current?.scrollIntoView?.({ block: 'start' });
      })
      .catch(() => setFailed(true));
  }, [source, slug, chapterNo]);

  const to = (no: number) => `/novels/${slug}/${no}`;
  const prev = chapter?.prev ?? null;
  const next = chapter?.next ?? null;

  const openedNo = chapter?.chapterNo;
  useEffect(() => {
    if (openedNo !== undefined) recordProgress(slug, openedNo);
  }, [slug, openedNo]);

  const current = chapter ? publicChapterLabel(chapter.chapterNo, chapter.title, chapter.label) : null;
  useDocumentTitle(current && novel ? `${current} · ${novel.title}` : current);

  // Arrow keys move between chapters, unless a modifier is held or the user is working in a form control
  // (the chapter select uses the arrows itself, and its change already navigates).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const el = e.target instanceof HTMLElement ? e.target : null;
      if (el && (el.isContentEditable || ['SELECT', 'INPUT', 'TEXTAREA'].includes(el.tagName))) return;
      const target = e.key === 'ArrowLeft' ? prev : next;
      if (target !== null) navigate(`/novels/${slug}/${target}`);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, slug, navigate]);

  const nextRef = next !== null ? novel?.chapters.find((c) => c.chapterNo === next) : undefined;

  return (
    <main ref={area} className="page reader-page">
      <Link className="back-link" to={`/novels/${slug}`}>
        <ArrowLeft className="icon" aria-hidden="true" />
        {novel?.title ?? 'Về trang truyện'}
      </Link>
      {failed && (
        <div className="alert" role="alert">
          <p className="alert__title">{PUBLIC_ERROR_TITLE}</p>
        </div>
      )}
      {!chapter && !failed && <p className="muted">Đang tải chương…</p>}
      {chapter && (
        <>
          <h1 className="visually-hidden">{current}</h1>
          <nav className="reader__toolbar" aria-label="Chuyển chương">
            {prev !== null ? (
              <Link className="button button--primary reader__step reader__step--prev" to={to(prev)}>
                <ChevronLeft className="icon" aria-hidden="true" />
                Chương trước
              </Link>
            ) : (
              <span className="reader__step reader__step--prev" aria-hidden="true" />
            )}
            {novel && (
              <div className="field reader__select">
                <label className="visually-hidden" htmlFor={selectId}>
                  Danh sách chương
                </label>
                <select id={selectId} value={chapter.chapterNo} onChange={(e) => navigate(to(Number(e.target.value)))}>
                  {novel.chapters.map((c) => (
                    <option key={c.chapterNo} value={c.chapterNo}>
                      {publicChapterLabel(c.chapterNo, c.title, c.label)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {next !== null ? (
              <Link className="button button--primary reader__step reader__step--next" to={to(next)}>
                Chương sau
                <ChevronRight className="icon" aria-hidden="true" />
              </Link>
            ) : (
              <span className="reader__step reader__step--next" aria-hidden="true" />
            )}
          </nav>
          <div className="reader__display">
            <button
              type="button"
              className="button button--small"
              aria-pressed={night}
              onClick={toggleNight}
            >
              {night ? <Sun className="icon" aria-hidden="true" /> : <Moon className="icon" aria-hidden="true" />}
              Chế độ đêm
            </button>
            <button
              type="button"
              className="button button--small"
              aria-label="Chữ nhỏ hơn"
              disabled={widthStep <= 0}
              onClick={() => stepWidth(-1)}
            >
              A−
            </button>
            <button
              type="button"
              className="button button--small"
              aria-label="Chữ lớn hơn"
              disabled={widthStep >= READER_WIDTHS.length - 1}
              onClick={() => stepWidth(1)}
            >
              A+
            </button>
          </div>
          <div
            className={['reader', hidden && 'reader--hidden', night && 'reader--night'].filter(Boolean).join(' ')}
            data-width={width}
            style={{ '--reader-width': `${width}px` } as CSSProperties}
          >
            {chapter.images.map((src, i) => (
              <img
                key={src}
                className="reader__page"
                src={src}
                alt={`${publicChapterName(chapter.chapterNo, chapter.label)}, trang ${i + 1}/${chapter.images.length}`}
                draggable={false}
                loading={i === 0 ? 'eager' : 'lazy'}
              />
            ))}
            <div className="reader__shield" aria-hidden="true" />
          </div>
          <p className="visually-hidden" aria-live="polite">
            {hidden ? 'Nội dung tạm ẩn khi cửa sổ không hoạt động.' : ''}
          </p>
          <p className="reader-print-note">Không hỗ trợ in trang này.</p>
          <section className="reader__end" aria-label="Hết chương">
            {next !== null ? (
              <Link className="reader__next-card" to={to(next)}>
                <span className="reader__next-card__text">
                  <span className="reader__next-card__hint">Chương sau</span>
                  <span className="reader__next-card__name">
                    {publicChapterLabel(next, nextRef?.title ?? null, nextRef?.label)}
                  </span>
                </span>
                <ChevronRight className="icon" aria-hidden="true" />
              </Link>
            ) : (
              <div className="reader__done">
                <p>Bạn đã đọc hết các chương đã đăng.</p>
                <Link className="button button--primary" to={`/novels/${slug}`}>
                  Về trang truyện
                </Link>
              </div>
            )}
            {prev !== null && (
              <Link className="reader__prev-link" to={to(prev)}>
                <ChevronLeft className="icon" aria-hidden="true" />
                Chương trước
              </Link>
            )}
          </section>
        </>
      )}
    </main>
  );
}
