import { Link } from 'react-router';
import type { PublicNovelSummary } from '../../data/novelTypes';
import { Cover } from '../../components/ui/Cover';
import { publicChapterProgress } from './publicNames';
import { ReadsMeta } from './ReadsMeta';
import './NovelTile.css';

/** A novel as a large-cover grid tile (`<li>`): 2:3 cover, title and `x/y chương`. */
export function NovelTile({ novel, reads }: { novel: PublicNovelSummary; reads?: number }) {
  return (
    <li>
      <Link className="novel-tile" to={`/novels/${novel.slug}`}>
        <Cover src={novel.coverUrl} className="novel-tile__cover" lazy />
        <span className="novel-tile__title">{novel.title}</span>
        <span className="meta">{publicChapterProgress(novel)} chương</span>
        <ReadsMeta reads={reads} />
      </Link>
    </li>
  );
}
