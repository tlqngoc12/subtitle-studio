import { BookOpen, CircleCheck, Eye, Library, Star, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { FanficBase } from '../../api/fanfics';
import { Cover } from '../ui/Cover';
import { formatCompact, formatReadingTime } from './format';
import './FanficCard.css';
import { useT } from '../../lib/i18n';

export function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <span className="fanfic-stat">
      <span className="fanfic-stat__label">
        <Icon className="icon icon--sm" aria-hidden="true" />
        {label}
      </span>
      <span className="fanfic-stat__value">{value}</span>
    </span>
  );
}

/**
 * A Wattpad story as a card: cover, title, Complete/Ongoing, Chapters | Reads | Votes | Time (Chapters and Reads in the
 * same place as on a translated novel's `NovelCard`) and a 3-line description.
 * The whole card is a link to the story on Wattpad; `menu` (the admin actions) sits beside it, never inside it.
 */
export function FanficCard({ fanfic, menu }: { fanfic: FanficBase; menu?: ReactNode }) {
  const t = useT();
  return (
    <article className={menu ? 'fanfic-card fanfic-card--menu' : 'fanfic-card'}>
      <a className="fanfic-card__link" href={fanfic.url} target="_blank" rel="noopener noreferrer">
        <Cover src={fanfic.coverUrl} className="fanfic-card__cover" lazy />
        <span className="fanfic-card__body">
          <span className="fanfic-card__title">{fanfic.title}</span>
          <span className={fanfic.completed ? 'fanfic-card__badge fanfic-card__badge--complete' : 'fanfic-card__badge'}>
            {fanfic.completed && <CircleCheck className="icon icon--sm" aria-hidden="true" />}
            {fanfic.completed ? t('Complete', 'Hoàn thành') : t('Ongoing', 'Đang ra')}
          </span>
          <span className="fanfic-card__stats">
            <Stat icon={Library} label={t('Chapters', 'Chương')} value={formatCompact(fanfic.partCount)} />
            <Stat icon={Eye} label={t('Reads', 'Lượt đọc')} value={formatCompact(fanfic.readCount)} />
            <Stat icon={Star} label={t('Votes', 'Bình chọn')} value={formatCompact(fanfic.voteCount)} />
            <Stat icon={BookOpen} label={t('Time', 'Thời gian đọc')} value={formatReadingTime(fanfic.readingMinutes)} />
          </span>
          {fanfic.description && <span className="fanfic-card__desc">{fanfic.description}</span>}
        </span>
      </a>
      {menu && <div className="fanfic-card__menu">{menu}</div>}
    </article>
  );
}
