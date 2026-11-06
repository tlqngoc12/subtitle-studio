import { FileText } from 'lucide-react';
import { Link } from 'react-router';
import type { ChapterSummary } from '../../api/novels';
import { EmptyState } from '../EmptyState';
import { StatusBadges } from './StatusBadges';

/** The chapter's label ("Ngoại truyện 1"), or "Chapter N". */
export function chapterName(chapterNo: number, label?: string | null): string {
  return label?.trim() ? label.trim() : `Chapter ${chapterNo}`;
}

/** The name with the title: "Chapter 3: Mưa", "Ngoại truyện 1: Ngày cưới". */
export function chapterLabel(chapterNo: number, title: string | null, label?: string | null): string {
  const name = chapterName(chapterNo, label);
  return title ? `${name}: ${title}` : name;
}

/** The Chapters tab: one row per chapter with its badges and page count. */
export function ChapterList({ novelId, chapters }: { novelId: number; chapters: ChapterSummary[] }) {
  if (chapters.length === 0) {
    return <EmptyState icon={FileText}>No chapters yet. Choose Add chapter, then add its page screenshots.</EmptyState>;
  }
  return (
    <ul className="chapter-list" aria-label="Chapters">
      {chapters.map((c) => (
        <li key={c.id} className="chapter-list__item">
          <Link className="chapter-list__open" to={`/novels/${novelId}/chapters/${c.id}`}>
            <span className="chapter-list__title">{chapterLabel(c.chapterNo, c.title, c.label)}</span>
            <span className="chapter-list__meta">
              <StatusBadges translation={c.translationStatus} publish={c.publishStatus} />
              <span className="meta">
                {c.pageCount} {c.pageCount === 1 ? 'page' : 'pages'}
              </span>
            </span>
          </Link>
          {c.translationStatus === 'FAILED' && c.translationError && (
            <p className="field__error chapter-list__error">{c.translationError}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
