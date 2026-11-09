import { BookOpen } from 'lucide-react';
import { Link } from 'react-router';
import type { PublicNovelSummary } from '../../data/novelTypes';
import { PUBLIC_STATUS_LABEL, publicChapterProgress } from './publicNames';

/** The small card of a novel: cover, title, status and `x/y chương`. A grid item (`<li>`). */
export function NovelCard({ novel }: { novel: PublicNovelSummary }) {
  return (
    <li>
      <Link className="novel-card" to={`/novels/${novel.slug}`}>
        {novel.coverUrl ? (
          <img className="novel-card__cover" src={novel.coverUrl} alt="" loading="lazy" />
        ) : (
          <span className="novel-card__cover novel-card__cover--empty" aria-hidden="true">
            <BookOpen className="icon" />
          </span>
        )}
        <span className="novel-card__body">
          <span className="novel-card__title">{novel.title}</span>
          <span className="badge badge--info">{PUBLIC_STATUS_LABEL[novel.novelStatus]}</span>
          <span className="meta">{publicChapterProgress(novel)} chương</span>
        </span>
      </Link>
    </li>
  );
}
