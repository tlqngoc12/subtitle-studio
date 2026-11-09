import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Info,
  Pause,
  Play,
} from "lucide-react";
import {
  useEffect,
  useState,
  type CSSProperties,
  type FocusEvent,
} from "react";
import { Link } from "react-router";
import { Tip } from "../../components/Tip";
import type { NovelSource } from "../../data/novelSource";
import type {
  PublicNovelDetail,
  PublicNovelSummary,
} from "../../data/novelTypes";
import { usePrefersReducedMotion } from "../../lib/usePrefersReducedMotion";
import {
  PUBLIC_STATUS_LABEL,
  latestUpdate,
  publicChapterName,
  publicChapterProgress,
  publicDate,
} from "./publicNames";
import { readProgress } from "./readerPrefs";

const ADVANCE_MS = 6000;
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The featured banner at the top of the public Novels page: the current novel on the left, the covers fanned on the
 * right (the current one in front; each cover links to its novel's page, and the small arrows browse). It moves on every 6 seconds unless paused,
 * hovered or focused, and never moves by itself with prefers-reduced-motion. `novels` is already in display order.
 */
export default function FeaturedNovels({
  novels,
  source,
}: {
  novels: PublicNovelSummary[];
  source: NovelSource;
}) {
  const count = novels.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [details, setDetails] = useState<Record<string, PublicNovelDetail>>({});
  const reduced = usePrefersReducedMotion();

  // The summaries do not say which chapter comes first, so the chapter lists are read (a handful of small files).
  useEffect(() => {
    let cancelled = false;
    for (const n of novels) {
      source
        .getNovel(n.slug)
        .then((d) => {
          if (!cancelled) setDetails((all) => ({ ...all, [n.slug]: d }));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [novels, source]);

  const running = count > 1 && !paused && !hovered && !focused && !reduced;
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(
      () => setIndex((i) => (i + 1) % count),
      ADVANCE_MS,
    );
    return () => clearTimeout(timer);
  }, [running, index, count]);

  if (count === 0) return null;
  const at = Math.min(index, count - 1);
  const novel = novels[at];
  const detail = details[novel.slug];
  const stored = readProgress(novel.slug);
  const resume =
    stored === null
      ? undefined
      : detail?.chapters.find((c) => c.chapterNo === stored);
  const first = detail?.chapters[0];
  const half = Math.floor(count / 2);

  function onBlur(e: FocusEvent<HTMLElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null))
      setFocused(false);
  }

  return (
    <section
      className="featured"
      aria-label="Truyện nổi bật"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={onBlur}
      style={
        {
          "--cover": novel.coverUrl ? `url("${novel.coverUrl}")` : "none",
        } as CSSProperties
      }
    >
      <div className="featured__bg" aria-hidden="true" />
      <div className="featured__info">
        <span className="badge badge--info">
          {PUBLIC_STATUS_LABEL[novel.novelStatus]}
        </span>
        <h2 className="featured__title">{novel.title}</h2>
        <hr className="featured__rule" />
        <ul className="featured__facts" aria-label="Thông tin">
          <li>
            <span>Chương</span>
            <span>{publicChapterProgress(novel)}</span>
          </li>
          {novel.originalAuthor && (
            <li>
              <span>Tác giả</span>
              <span>{novel.originalAuthor}</span>
            </li>
          )}
          <li>
            <span>Cập nhật</span>
            <span>{publicDate(latestUpdate(novel))}</span>
          </li>
        </ul>
        <div className="featured__actions">
          {resume ? (
            <Link
              className="button button--primary"
              to={`/novels/${novel.slug}/${resume.chapterNo}`}
            >
              Đọc tiếp: {publicChapterName(resume.chapterNo, resume.label)}
            </Link>
          ) : (
            <Link
              className="button button--primary"
              to={
                first
                  ? `/novels/${novel.slug}/${first.chapterNo}`
                  : `/novels/${novel.slug}`
              }
            >
              Đọc từ đầu
            </Link>
          )}
          <Tip label="Thông tin truyện">
            <Link
              className="button button--icon"
              to={`/novels/${novel.slug}`}
              aria-label="Thông tin truyện"
            >
              <Info className="icon" aria-hidden="true" />
            </Link>
          </Tip>
        </div>
      </div>

      <div className="featured__stage">
        <div className="featured__fan">
          {novels.map((n, i) => {
            // Signed distance to the current novel around the circle: -2..2 for five novels.
            const o = ((((i - at + half) % count) + count) % count) - half;
            const current = i === at;
            return (
              <Link
                key={n.slug}
                className="featured__cover"
                to={`/novels/${n.slug}`}
                aria-label={n.title}
                aria-current={current ? "true" : undefined}
                style={
                  {
                    "--o": String(o),
                    "--d": String(Math.abs(o)),
                  } as CSSProperties
                }
              >
                {n.coverUrl ? (
                  <img
                    className="featured__art"
                    src={n.coverUrl}
                    alt=""
                    draggable={false}
                  />
                ) : (
                  <span
                    className="featured__art novel-card__cover--empty"
                    aria-hidden="true"
                  >
                    <BookOpen className="icon" />
                  </span>
                )}
              </Link>
            );
          })}
        </div>
        <div className="featured__controls">
          {count > 1 && (
            <Tip label="Truyện trước">
              <button
                className="button button--icon"
                type="button"
                aria-label="Truyện trước"
                onClick={() => setIndex((at - 1 + count) % count)}
              >
                <ChevronLeft className="icon" aria-hidden="true" />
              </button>
            </Tip>
          )}
          <span className="featured__counter">{`${pad(at + 1)} / ${pad(count)}`}</span>
          {count > 1 && (
            <Tip label="Truyện sau">
              <button
                className="button button--icon"
                type="button"
                aria-label="Truyện sau"
                onClick={() => setIndex((at + 1) % count)}
              >
                <ChevronRight className="icon" aria-hidden="true" />
              </button>
            </Tip>
          )}
          {count > 1 && (
            <button
              className="button button--icon"
              type="button"
              aria-label={paused ? "Tiếp tục" : "Tạm dừng"}
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? (
                <Play className="icon" aria-hidden="true" />
              ) : (
                <Pause className="icon" aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
