import { Eye } from 'lucide-react';
import { formatReads } from '../../data/novelReads';
import './ReadsMeta.css';

/** "1,2 N lượt đọc" with an eye icon, in grey meta text. Renders nothing when the count is unavailable. */
export function ReadsMeta({ reads }: { reads: number | undefined }) {
  if (reads === undefined) return null;
  return (
    <span className="meta reads-meta">
      <Eye className="icon" aria-hidden="true" />
      {formatReads(reads)} lượt đọc
    </span>
  );
}
