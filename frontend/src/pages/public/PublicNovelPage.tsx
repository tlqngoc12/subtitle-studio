import * as Tabs from "@radix-ui/react-tabs";
import { Check, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import type { NovelSource } from "../../data/novelSource";
import type { PublicNovelDetail } from "../../data/novelTypes";
import { readProgress, readReadChapters } from "./readerPrefs";
import { Alert } from '../../components/ui/Alert';
import { LoadingText } from '../../components/ui/LoadingText';
import {
  PUBLIC_ERROR_TITLE,
  PUBLIC_STATUS_LABEL,
  publicChapterLabel,
  useDocumentTitle,
} from "./publicNames";
import { Cover } from '../../components/ui/Cover';
import './PublicNovelPage.css';
import '../../components/novel/ChapterList.css';

/** A novel's public page: cover, the eight fields (description as plain text) and its published chapters. */
export default function PublicNovelPage({ source }: { source: NovelSource }) {
  const { slug = "" } = useParams();
  const [novel, setNovel] = useState<PublicNovelDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [params, setParams] = useSearchParams();
  useDocumentTitle(novel?.title ?? null);

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
      <main className="page">
        <Alert title={PUBLIC_ERROR_TITLE}>
          <Link to="/novels">Về danh sách truyện</Link>
        </Alert>
      </main>
    );
  }
  if (!novel) {
    return (
      <main className="page">
        <LoadingText>Đang tải truyện…</LoadingText>
      </main>
    );
  }

  const first = novel.chapters[0];
  const stored = readProgress(novel.slug);
  const resume =
    stored === null
      ? undefined
      : novel.chapters.find((c) => c.chapterNo === stored);
  const read = new Set(readReadChapters(novel.slug));
  // The chapter list is the default tab; the URL only names the other one (?tab=intro), so Back returns to it.
  const tab = params.get("tab") === "intro" ? "intro" : "chapters";
  function changeTab(value: string) {
    setParams(value === "intro" ? { tab: "intro" } : {});
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
    <main className="page">
      <Breadcrumbs
        items={[{ label: "Novels", to: "/novels" }, { label: novel.title }]}
      />
      <header className="novel-hero">
        <Cover src={novel.coverUrl} className="novel-hero__cover" />
        <div className="novel-hero__text">
          <h1 className="masthead__name">{novel.title}</h1>
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
            {resume ? (
              <>
                <Link
                  className="button button--primary"
                  to={`/novels/${novel.slug}/${resume.chapterNo}`}
                >
                  Đọc tiếp:{" "}
                  {publicChapterLabel(
                    resume.chapterNo,
                    resume.title,
                    resume.label,
                  )}
                </Link>
                <Link
                  className="button button--small"
                  to={`/novels/${novel.slug}/${first.chapterNo}`}
                >
                  Đọc từ đầu
                </Link>
              </>
            ) : (
              first && (
                <Link
                  className="button button--primary"
                  to={`/novels/${novel.slug}/${first.chapterNo}`}
                >
                  Bắt đầu đọc
                </Link>
              )
            )}
            {novel.sourceUrl && (
              <a
                className="button button--small"
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
      </header>

      {novel.description ? (
        <Tabs.Root value={tab} onValueChange={changeTab} className="tabs">
          <Tabs.List className="tabs__list" aria-label="Thông tin truyện">
            <Tabs.Trigger className="tabs__tab" value="intro">
              Giới thiệu
            </Tabs.Trigger>
            <Tabs.Trigger className="tabs__tab" value="chapters">
              Danh sách chương
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="intro" className="tabs__panel">
            <p className="novel-description">{novel.description}</p>
          </Tabs.Content>
          <Tabs.Content value="chapters" className="tabs__panel">
            {chapterList}
          </Tabs.Content>
        </Tabs.Root>
      ) : (
        <>
          <h2 className="history__heading">Danh sách chương</h2>
          {chapterList}
        </>
      )}
    </main>
  );
}
