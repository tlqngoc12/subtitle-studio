import { Info } from "lucide-react";
import {
  useEffect,
  useState,
  type CSSProperties,
  type FocusEvent,
} from "react";
import { Link } from "react-router";
import type { NovelSource } from "../../data/novelSource";
import type {
  PublicNovelDetail,
  PublicNovelSummary,
} from "../../data/novelTypes";
import {
  PUBLIC_STATUS_LABEL,
  latestUpdate,
  publicChapterName,
  publicChapterCount,
} from "./publicNames";
import { formatInstant } from "../../lib/dates";
import { readProgress } from "./readerPrefs";
import { FanCarousel } from '../../components/ui/FanCarousel';
import { IconLink } from '../../components/ui/IconButton';
import './FeaturedNovels.css';

/**
 * The featured banner at the top of the public Novels page: the current novel on the left, the covers fanned on the
 * right (a FanCarousel: the current one in front; each cover links to its novel's page, and the small arrows
 * browse). Hovering or focusing anywhere in the banner holds the carousel's 6 second timer. `novels` is already in
 * display order.
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
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [details, setDetails] = useState<Record<string, PublicNovelDetail>>({});

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
            <span>{publicChapterCount(novel)}</span>
          </li>
          {novel.originalAuthor && (
            <li>
              <span>Tác giả</span>
              <span>{novel.originalAuthor}</span>
            </li>
          )}
          <li>
            <span>Cập nhật</span>
            <span>{formatInstant(latestUpdate(novel))}</span>
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
          <IconLink label="Thông tin truyện" icon={Info} to={`/novels/${novel.slug}`} />
        </div>
      </div>

      <div className="featured__stage">
        <FanCarousel
          items={novels.map((n) => ({
            key: n.slug,
            src: n.coverUrl,
            alt: '',
            name: n.title,
            href: `/novels/${n.slug}`,
          }))}
          index={at}
          onIndexChange={setIndex}
          hold={hovered || focused}
          labels={{ previous: 'Truyện trước', next: 'Truyện sau' }}
        />
      </div>
    </section>
  );
}
