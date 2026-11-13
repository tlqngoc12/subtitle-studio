import * as Tabs from "@radix-ui/react-tabs";
import { TabTrigger } from "../../components/ui/TabTrigger";
import { BookmarkCheck, BookmarkPlus, Check, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link, useParams, useSearchParams } from "react-router";
import type { NovelSource } from "../../data/novelSource";
import type { PublicNovelDetail } from "../../data/novelTypes";
import { useReadCounts } from "../../data/novelReads";
import { ReadsMeta } from "./ReadsMeta";
import { readProgress, readReadChapters, readShelf, toggleShelf } from "./readerPrefs";
import { Alert } from '../../components/ui/Alert';
import { Page } from "../../components/ui/Page";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageSkeleton } from "../../components/ui/Skeleton";
import {
  PUBLIC_ERROR_TITLE,
  PUBLIC_STATUS_LABEL,
  publicChapterLabel,
  useDocumentTitle,
} from "./publicNames";
import { Cover } from '../../components/ui/Cover';
import './PublicNovelPage.css';
import '../../components/novel/ChapterList.css';

/** The 11-character YouTube video id; anything else is never put in an iframe. */
const TRAILER_ID = /^[A-Za-z0-9_-]{11}$/;

/** A novel's public page: cover, the eight fields (description as plain text), its published chapters and an optional trailer tab. */
export default function PublicNovelPage({ source }: { source: NovelSource }) {
  const { slug = "" } = useParams();
  const [novel, setNovel] = useState<PublicNovelDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [params, setParams] = useSearchParams();
  const reads = useReadCounts();
  // Shelf state lives here so the button still flips for the session when storage is blocked.
  const [onShelf, setOnShelf] = useState(() => readShelf().includes(slug));
  useEffect(() => setOnShelf(readShelf().includes(slug)), [slug]);
  useDocumentTitle(novel?.title ?? null);

  function flipShelf() {
    const next = !onShelf;
    toggleShelf(slug);
    setOnShelf(next);
    toast.success(next ? "Đã thêm vào tủ sách" : "Đã bỏ khỏi tủ sách");
  }

  useEffect(() => {
    setNovel(null);
    setFailed(false);
    source
      .getNovel(slug)
      .then(setNovel)
      .catch(() => setFailed(true));
  }, [source, slug]);

  if (failed) {
    return (
      <Page>
        <Alert title={PUBLIC_ERROR_TITLE}>
          <Link to="/novels">Về danh sách truyện</Link>
        </Alert>
      </Page>
    );
  }
  if (!novel) {
    return (
      <Page>
        <PageSkeleton rows={4} />
      </Page>
    );
  }

  const first = novel.chapters[0];
  const stored = readProgress(novel.slug);
  const resume =
    stored === null
      ? undefined
      : novel.chapters.find((c) => c.chapterNo === stored);
  const read = new Set(readReadChapters(novel.slug));
  // A tab exists only when it has content: the chapter list is always there and is the default, so the URL only
  // names the other tabs (?tab=intro, ?tab=trailer), and Back returns to it. An unavailable tab falls back to it.
  const hasIntro = Boolean(novel.description);
  const trailerId = TRAILER_ID.test(novel.trailerVideoId ?? "") ? novel.trailerVideoId! : null;
  const requested = params.get("tab");
  const tab =
    requested === "intro" && hasIntro
      ? "intro"
      : requested === "trailer" && trailerId
        ? "trailer"
        : "chapters";
  function changeTab(value: string) {
    setParams(value === "intro" || value === "trailer" ? { tab: value } : {});
  }
  const chapterClass =
    novel.chapters.length > 12
      ? "chapter-list chapter-list--public chapter-list--columns"
      : "chapter-list chapter-list--public";
  const chapterList = (
    <ol className={chapterClass} aria-label="Danh sách chương">
      {novel.chapters.map((c) => {
        const isRead = read.has(c.chapterNo);
        return (
          <li
            key={c.chapterNo}
            className={
              isRead
                ? "chapter-list__item chapter-list__item--read"
                : "chapter-list__item"
            }
          >
            <div className="chapter-list__row">
              <Link
                className="chapter-list__open"
                to={`/novels/${novel.slug}/${c.chapterNo}`}
              >
                {publicChapterLabel(c.chapterNo, c.title, c.label)}
              </Link>
              {c.chapterNo === stored && (
                <span className="badge badge--info">Đang đọc</span>
              )}
              {isRead && (
                <Check
                  className="icon chapter-list__check"
                  role="img"
                  aria-label="Đã đọc"
                />
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
  return (
    <Page className="novel-page">
      <PageHeader
        variant="hero"
        breadcrumbs={[{ label: "Novels", to: "/novels" }, { label: novel.title }]}
        title={novel.title}
        media={<Cover src={novel.coverUrl} className="novel-hero__cover" />}
        meta={
          <div className="novel-hero__rest">
              <dl className="novel-facts">
                {novel.originalAuthor && (
                  <div>
                    <dt>Tác giả</dt>
                    <dd>{novel.originalAuthor}</dd>
                  </div>
                )}
                <div>
                  <dt>Trạng thái</dt>
                  <dd>{PUBLIC_STATUS_LABEL[novel.novelStatus]}</dd>
                </div>
                {novel.translatorCredit && (
                  <div>
                    <dt>Bản dịch</dt>
                    <dd>{novel.translatorCredit}</dd>
                  </div>
                )}
              </dl>
              <ReadsMeta reads={reads?.[novel.slug]} />
              {novel.tags.length > 0 && (
                <ul className="tag-list" aria-label="Thể loại">
                  {novel.tags.map((t) => (
                    <li key={t} className="badge badge--info">
                      {t}
                    </li>
                  ))}
                </ul>
              )}
              <div className="novel-hero__actions">
                {/* In the hero on desktop; under 768px the stylesheet pins it to the bottom of the screen as a full-width bar. */}
                <div className="novel-cta">
                  {resume ? (
                    <Link
                      className="button button--primary button--l novel-cta__read"
                      to={`/novels/${novel.slug}/${resume.chapterNo}`}
                    >
                      Đọc tiếp:{" "}
                      {publicChapterLabel(resume.chapterNo, resume.title, resume.label)}
                    </Link>
                  ) : (
                    first && (
                      <Link
                        className="button button--primary button--l novel-cta__read"
                        to={`/novels/${novel.slug}/${first.chapterNo}`}
                      >
                        Bắt đầu đọc
                      </Link>
                    )
                  )}
                  <button
                    type="button"
                    className="button button--icon button--l novel-cta__shelf"
                    aria-pressed={onShelf}
                    aria-label={onShelf ? "Đã lưu vào tủ sách" : "Thêm vào tủ sách"}
                    onClick={flipShelf}
                  >
                    {onShelf ? (
                      <BookmarkCheck className="icon" aria-hidden="true" />
                    ) : (
                      <BookmarkPlus className="icon" aria-hidden="true" />
                    )}
                  </button>
                </div>
                {resume && (
                  <Link
                    className="button button--s"
                    to={`/novels/${novel.slug}/${first.chapterNo}`}
                  >
                    Đọc từ đầu
                  </Link>
                )}
                {novel.sourceUrl && (
                  <a
                    className="button button--s"
                    href={novel.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="icon" aria-hidden="true" />
                    Truyện gốc
                  </a>
                )}
              </div>
          </div>
        }
      />
      {hasIntro || trailerId ? (
        <Tabs.Root value={tab} onValueChange={changeTab} className="tabs">
          <Tabs.List className="tabs__list" aria-label="Thông tin truyện">
            {hasIntro && (
              <TabTrigger className="tabs__tab" value="intro">
                Giới thiệu
              </TabTrigger>
            )}
            <TabTrigger className="tabs__tab" value="chapters">
              Danh sách chương
            </TabTrigger>
            {trailerId && (
              <TabTrigger className="tabs__tab" value="trailer">
                Trailer
              </TabTrigger>
            )}
          </Tabs.List>
          {hasIntro && (
            <Tabs.Content value="intro" className="tabs__panel">
              <p className="novel-description">{novel.description}</p>
            </Tabs.Content>
          )}
          <Tabs.Content value="chapters" className="tabs__panel">
            {chapterList}
          </Tabs.Content>
          {trailerId && (
            // Radix unmounts a tab's content while it is not selected, so YouTube is only loaded once Trailer opens.
            <Tabs.Content value="trailer" className="tabs__panel">
              <iframe
                className="novel-trailer"
                src={`https://www.youtube-nocookie.com/embed/${trailerId}`}
                title={`Trailer: ${novel.title}`}
                allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </Tabs.Content>
          )}
        </Tabs.Root>
      ) : (
        <>
          <h2 className="history__heading">Danh sách chương</h2>
          {chapterList}
        </>
      )}
    </Page>
  );
}
