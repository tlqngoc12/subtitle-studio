import { BookOpen, CalendarClock, Eye, Library, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { formatInstant } from '../../lib/dates';
import type { NovelListItem } from '../../lib/novelList';
import { Cover } from '../ui/Cover';
import { Stat } from '../fanfics/FanficCard';
import { formatCompact } from '../fanfics/format';
import '../fanfics/FanficCard.css';
import './NovelCard.css';

/** The fields a card shows; the admin `NovelSummary` and the public `PublicNovelSummary` both fit. */
export interface NovelCardData extends NovelListItem {
  coverUrl: string | null;
  description?: string | null;
  publishedCount: number;
  /** Admin: every chapter (drafts included). */
  chapterCount?: number;
  /** Public: every chapter, missing in files published earlier. */
  totalChapters?: number;
  /** Admin only: picked for the banner. */
  featured?: boolean;
}

/**
 * A translated novel as a Fanfics-style card: cover, title, status, stats and a short description. The whole card
 * links to `href`; `menu` (admin) sits in the corner, outside the link. `admin` picks the English admin stats
 * (Chapters, Published, Reads, Updated) over the Vietnamese public ones (Chương, Lượt đọc, Cập nhật).
 */
export function NovelCard({
  novel,
  href,
  reads,
  menu,
  admin = false,
}: {
  novel: NovelCardData;
  href: string;
  /** Total reads, or undefined while unknown. */
  reads?: number;
  menu?: ReactNode;
  admin?: boolean;
}) {
  const completed = novel.novelStatus === 'COMPLETED';
  const updated = formatInstant(novel.lastPublishedAt ?? novel.updatedAt);
  const readsText = reads === undefined ? '–' : formatCompact(reads);
  const stats: { icon: LucideIcon; label: string; value: string }[] = admin
    ? [
        { icon: Library, label: 'Chapters', value: String(novel.chapterCount ?? novel.publishedCount) },
        { icon: BookOpen, label: 'Published', value: String(novel.publishedCount) },
        { icon: Eye, label: 'Reads', value: readsText },
        { icon: CalendarClock, label: 'Updated', value: updated },
      ]
    : [
        {
          icon: Library,
          label: 'Chương',
          value: `${novel.publishedCount}/${novel.totalChapters ?? novel.publishedCount}`,
        },
        { icon: Eye, label: 'Lượt đọc', value: readsText },
        { icon: CalendarClock, label: 'Cập nhật', value: updated },
      ];
  const notOnSite = admin && novel.featured && novel.publishedCount === 0;
  return (
    <article className={menu ? 'fanfic-card fanfic-card--menu' : 'fanfic-card'}>
      <Link className="fanfic-card__link" to={href}>
        <Cover src={novel.coverUrl} className="fanfic-card__cover" lazy />
        <span className="fanfic-card__body">
          <span className="fanfic-card__title">{novel.title}</span>
          <span className="novel-card2__badges">
            <span className={completed ? 'fanfic-card__badge fanfic-card__badge--complete' : 'fanfic-card__badge'}>
              {admin ? (completed ? 'Completed' : 'Ongoing') : completed ? 'Hoàn thành' : 'Đang ra'}
            </span>
            {admin && novel.featured && <span className="novel-card2__banner">On banner</span>}
          </span>
          <span className="fanfic-card__stats">
            {stats.map((s) => (
              <Stat key={s.label} icon={s.icon} label={s.label} value={s.value} />
            ))}
          </span>
          {notOnSite && <span className="novel-card2__hint">Not on the site until a chapter is published</span>}
          {novel.description && <span className="fanfic-card__desc">{novel.description}</span>}
        </span>
      </Link>
      {menu && <div className="fanfic-card__menu">{menu}</div>}
    </article>
  );
}
