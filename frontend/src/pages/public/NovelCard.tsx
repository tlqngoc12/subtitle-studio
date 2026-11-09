import { Link } from 'react-router';
import type { PublicNovelSummary } from '../../data/novelTypes';
import { PUBLIC_STATUS_LABEL, publicChapterProgress } from './publicNames';
import { Cover } from '../../components/ui/Cover';
import './NovelCard.css';

/** The small card of a novel: cover, title, status and `x/y chương`. A grid item (`<li>`). */
export function NovelCard({ novel }: { novel: PublicNovelSummary }) {
  return (
    <li>
      <Link className="novel-card" to={`/novels/${novel.slug}`}>
        <Cover src={novel.coverUrl} lazy />
        <span className="novel-card__body">
          <h3 className="novel-card__title">{novel.title}</h3>
          <span className="badge badge--info">{PUBLIC_STATUS_LABEL[novel.novelStatus]}</span>
          <span className="meta">{publicChapterProgress(novel)} chương</span>
        </span>
      </Link>
    </li>
  );
}
