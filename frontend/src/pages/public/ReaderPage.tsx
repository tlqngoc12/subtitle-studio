import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import type { NovelSource } from "../../data/novelSource";
import type {
  PublicChapterFile,
  PublicNovelDetail,
} from "../../data/novelTypes";
import { recordRead } from "../../data/novelReads";
import { useCopyGuard } from "../../lib/useCopyGuard";
import { useReaderChrome } from "../../lib/useReaderChrome";
import { scrollToProgress, useScrollProgress } from "../../lib/useScrollProgress";
import { usePrefersReducedMotion } from "../../lib/usePrefersReducedMotion";
import {
  PUBLIC_ERROR_TITLE,
  publicChapterLabel,
  publicChapterName,
  useDocumentTitle,
} from "./publicNames";
import { ReaderSkeleton } from "./ReaderSkeleton";
import { ReaderBar } from "./ReaderBar";
import { ReaderBottomBar } from "./ReaderBottomBar";
import { ReaderTocDrawer } from "./ReaderTocDrawer";
import { ReaderSettingsSheet } from "./ReaderSettings";
import { OWN_KEYS } from "./readerKeys";
import { Alert } from '../../components/ui/Alert';
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
  const reducedMotion = usePrefersReducedMotion();
  const [tocOpen, setTocOpen] = useState(false);
  const tocOpener = useRef<HTMLElement | null>(null);
  const openToc = useCallback(() => {
    tocOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setTocOpen(true);
  }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const chrome = useReaderChrome(tocOpen || settingsOpen || pinned);
  const reader = useRef<HTMLDivElement>(null);
  const progress = useScrollProgress(reader);
  const onPinnedChange = useCallback((p: boolean) => setPinned(p), []);

  // Reaching the end of the chapter brings the bars back, with the next-chapter controls.
  const { show } = chrome;
  useEffect(() => {
    if (progress >= 0.98) show();
  }, [progress, show]);

  // Tap zones (compact screens): top quarter pages up, bottom quarter pages down, the middle toggles the bars.
  function onShieldClick(e: MouseEvent<HTMLDivElement>) {
    if (!compact || tocOpen || settingsOpen || e.target !== e.currentTarget) return;
    const behavior = reducedMotion ? "auto" : "smooth";
    const h = window.innerHeight;
    if (e.clientY < h * 0.25) window.scrollBy({ top: -0.9 * h, behavior });
    else if (e.clientY > h * 0.75) window.scrollBy({ top: 0.9 * h, behavior });
    else chrome.toggle();
  }

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

  const chapterIndex = novel ? novel.chapters.findIndex((c) => c.chapterNo === (chapter?.chapterNo ?? Number(chapterNo))) : -1;
  const position = novel && chapterIndex >= 0 ? { index: chapterIndex + 1, total: novel.chapters.length } : null;

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

  // Prefetch the next chapter once per chapter, the first time the reader passes 70% (or at once when it fits the screen).
  const prefetched = useRef(false);
  useEffect(() => {
    prefetched.current = false;
  }, [chapterNo]);
  useEffect(() => {
    if (!chapter || next === null || progress < 0.7 || prefetched.current) return;
    prefetched.current = true;
    source
      .getChapter(slug, next)
      .then((c) => {
        const first = pickFormat(c, compact, size).images[0];
        if (first) new Image().src = first;
      })
      .catch(() => {});
  }, [chapter, next, progress, source, slug, compact, size]);

  const loadingTitle = novel?.chapters.find((c) => c.chapterNo === Number(chapterNo));

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
        hidden={chrome.hidden}
        onPinnedChange={onPinnedChange}
        onTocOpenChange={openToc}
        settingsOpen={settingsOpen && !compact}
        onSettingsOpenChange={setSettingsOpen}
        theme={theme}
        onTheme={changeTheme}
        size={size}
        onSize={changeSize}
      />
      <div className="reader-progress" aria-hidden="true" style={{ transform: `scaleX(${progress})` }} />
      <ReaderTocDrawer
        open={tocOpen}
        onOpenChange={setTocOpen}
        restoreFocus={tocOpener}
        slug={slug}
        chapters={novel?.chapters ?? []}
        currentNo={chapter?.chapterNo ?? Number(chapterNo)}
      />
      {compact && (
        <ReaderSettingsSheet
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          theme={theme}
          onTheme={changeTheme}
          size={size}
          onSize={changeSize}
        />
      )}
      {compact && (
        <ReaderBottomBar
          slug={slug}
          prev={prev}
          next={next}
          progress={progress}
          onSeek={(p) => reader.current && scrollToProgress(reader.current, p)}
          onToc={openToc}
          onSettings={() => setSettingsOpen(true)}
          hidden={chrome.hidden}
          position={position}
        />
      )}
      {failed && (
        <Alert title={PUBLIC_ERROR_TITLE} />
      )}
      {!chapter && !failed && (
        <>
          {loadingTitle && (
            <h1 className="reader-loading-title">
              {publicChapterLabel(loadingTitle.chapterNo, loadingTitle.title, loadingTitle.label)}
            </h1>
          )}
          <ReaderSkeleton />
        </>
      )}
      {chapter && format && (
        <>
          <h1 className="visually-hidden">{current}</h1>
          <div
            key={chapterNo}
            ref={reader}
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
            <div className="reader__shield" aria-hidden="true" onClick={onShieldClick} />
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
