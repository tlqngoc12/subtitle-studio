import { Link } from 'react-router';
import type { PublicNovelSummary } from '../../data/novelTypes';
import { Cover } from '../../components/ui/Cover';
import { PUBLIC_STATUS_LABEL, latestUpdate, publicChapterProgress, relativeTime } from './publicNames';
import { ReadsMeta } from './ReadsMeta';
import './NovelRow.css';

/** A novel as a list row (`<li>`): small cover, title, status and meta; optionally a "continue reading" link. */
export function NovelRow({
  novel,
  continueNo,
  reads,
}: {
  novel: PublicNovelSummary;
  continueNo?: number | null;
  reads?: number;
}) {
  return (
    <li className="novel-row">
      <Link className="novel-row__link" to={`/novels/${novel.slug}`}>
        <Cover src={novel.coverUrl} className="novel-row__cover" lazy />
        <span className="novel-row__body">
          <span className="novel-row__title">{novel.title}</span>
          <span className="novel-row__line">
            <span className="badge badge--info">{PUBLIC_STATUS_LABEL[novel.novelStatus]}</span>
            <span className="meta">
              {publicChapterProgress(novel)} chương · {relativeTime(latestUpdate(novel))}
            </span>
            <ReadsMeta reads={reads} />
          </span>
        </span>
      </Link>
      {continueNo != null && (
        <Link className="novel-row__continue" to={`/novels/${novel.slug}/${continueNo}`}>
          Đọc tiếp: Chương {continueNo}
        </Link>
      )}
    </li>
  );
}
