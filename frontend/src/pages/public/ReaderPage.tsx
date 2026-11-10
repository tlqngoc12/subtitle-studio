import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import type { NovelSource } from "../../data/novelSource";
import type {
  PublicChapterFile,
  PublicNovelDetail,
} from "../../data/novelTypes";
import { recordRead } from "../../data/novelReads";
import { useCopyGuard } from "../../lib/useCopyGuard";
import {
  PUBLIC_ERROR_TITLE,
  publicChapterLabel,
  publicChapterName,
  useDocumentTitle,
} from "./publicNames";
import { OWN_KEYS, ReaderBar } from "./ReaderBar";
import { Alert } from '../../components/ui/Alert';
import { LoadingText } from '../../components/ui/LoadingText';
import {
  readSize,
  readTheme,
  recordProgress,
  saveSize,
  saveTheme,
  type ReaderSize,
  type ReaderTheme,
} from "./readerPrefs";
import { READER_COLUMNS, pickFormat } from "./readerLayout";
import { COMPACT_QUERY, useMediaQuery } from "../../lib/useMediaQuery";
import './readerThemes.css';
import './ReaderPage.css';

/**
 * The public chapter reader: breadcrumbs, the controls in the top bar (previous, next, contents, settings), the chapter as drawn
 * images (no text on the page), previous/next buttons at the end and the copy guards of {@link useCopyGuard}.
 * Copy is Vietnamese.
 */
export default function ReaderPage({ source }: { source: NovelSource }) {
  const { slug = "", chapterNo = "" } = useParams();
  const navigate = useNavigate();
  // On <main>, which is always rendered, so the guard's listeners attach on mount.
  const area = useRef<HTMLElement>(null);
  const { hidden } = useCopyGuard(area);
  const [novel, setNovel] = useState<PublicNovelDetail | null>(null);
  const [chapter, setChapter] = useState<PublicChapterFile | null>(null);
  const [failed, setFailed] = useState(false);
  const [theme, setTheme] = useState<ReaderTheme>(readTheme);
  const [size, setSize] = useState<ReaderSize>(readSize);
  const compact = useMediaQuery(COMPACT_QUERY);

  function changeTheme(t: ReaderTheme) {
    saveTheme(t);
    setTheme(t);
  }

  function changeSize(s: ReaderSize) {
    saveSize(s);
    setSize(s);
  }

  // The same theme on <html> so the page behind the reader (and the overscroll) takes the paper colour too.
  useEffect(() => {
    document.documentElement.dataset.readerTheme = theme;
    return () => {
      delete document.documentElement.dataset.readerTheme;
    };
  }, [theme]);

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
        area.current?.scrollIntoView?.({ block: "start" });
      })
      .catch(() => setFailed(true));
  }, [source, slug, chapterNo]);

  const format = chapter ? pickFormat(chapter, compact, size) : null;
  const to = (no: number) => `/novels/${slug}/${no}`;
  const prev = chapter?.prev ?? null;
  const next = chapter?.next ?? null;

  const openedNo = chapter?.chapterNo;
  useEffect(() => {
    if (openedNo === undefined) return;
    recordProgress(slug, openedNo);
    recordRead(slug, openedNo);
  }, [slug, openedNo]);

  const current = chapter
    ? publicChapterLabel(chapter.chapterNo, chapter.title, chapter.label)
    : null;
  useDocumentTitle(current && novel ? `${current} · ${novel.title}` : current);

  // Arrow keys move between chapters, unless a modifier is held, the user is working in a form control or the focus
  // is inside one of the bar's popovers (the chapter list and the settings use the keys themselves).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const el = e.target instanceof HTMLElement ? e.target : null;
      if (
        el &&
        (el.isContentEditable ||
          ["SELECT", "INPUT", "TEXTAREA"].includes(el.tagName))
      )
        return;
      if (el?.closest(`[${OWN_KEYS}]`)) return;
      const target = e.key === "ArrowLeft" ? prev : next;
      if (target !== null) navigate(`/novels/${slug}/${target}`);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, slug, navigate]);

  const crumbs = [
    { label: "Novels", to: "/novels" },
    { label: novel?.title ?? "Về trang truyện", to: `/novels/${slug}` },
    {
      label: publicChapterName(
        chapter?.chapterNo ?? Number(chapterNo),
        chapter?.label,
      ),
    },
  ];

  return (
    <main
      ref={area}
      className="page reader-page"
      data-reader-theme={theme}
      style={{ "--reader-width": `${READER_COLUMNS[size]}px` } as CSSProperties}
    >
      <Breadcrumbs items={crumbs} />
      <ReaderBar
        slug={slug}
        novelTitle={novel?.title ?? ""}
        chapterName={publicChapterName(
          chapter?.chapterNo ?? Number(chapterNo),
          chapter?.label,
        )}
        prev={prev}
        next={next}
        chapters={novel?.chapters ?? []}
        currentNo={chapter?.chapterNo ?? Number(chapterNo)}
        theme={theme}
        onTheme={changeTheme}
        size={size}
        onSize={changeSize}
      />
      {failed && (
        <Alert title={PUBLIC_ERROR_TITLE} />
      )}
      {!chapter && !failed && <LoadingText>Đang tải chương…</LoadingText>}
      {chapter && format && (
        <>
          <h1 className="visually-hidden">{current}</h1>
          <div
            className={["reader", hidden && "reader--hidden"].filter(Boolean).join(" ")}
            data-width={READER_COLUMNS[size]}
          >
            {format.images.map((src, i) => (
              <img
                key={src}
                className="reader__page"
                src={src}
                alt={`${publicChapterName(chapter.chapterNo, chapter.label)}, trang ${i + 1}/${format.images.length}`}
                style={{ aspectRatio: `${format.width} / ${format.height}` }}
                draggable={false}
                loading={i === 0 ? "eager" : "lazy"}
              />
            ))}
            <div className="reader__shield" aria-hidden="true" />
          </div>
          <p className="visually-hidden" aria-live="polite">
            {hidden ? "Nội dung tạm ẩn khi cửa sổ không hoạt động." : ""}
          </p>
          <p className="reader-print-note">Không hỗ trợ in trang này.</p>
          <section className="reader__end" aria-label="Hết chương">
            <div className="reader__end-nav">
              {prev !== null && (
                <Link
                  className="button button--primary reader__end-button"
                  to={to(prev)}
                >
                  <ChevronLeft className="icon" aria-hidden="true" />
                  Chương trước
                </Link>
              )}
              {next !== null && (
                <Link
                  className="button button--primary reader__end-button reader__end-button--next"
                  to={to(next)}
                >
                  Chương sau
                  <ChevronRight className="icon" aria-hidden="true" />
                </Link>
              )}
            </div>
            {next === null && (
              <div className="reader__done">
                <p>Bạn đã đọc hết các chương đã đăng.</p>
                <Link className="button button--primary" to={`/novels/${slug}`}>
                  Về trang truyện
                </Link>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
