import { ListChecks } from 'lucide-react';
import type { WattpadPreviewPart } from '../../api/novels';
import { formatInstant } from '../../lib/dates';
import { EmptyState } from '../EmptyState';
import './WattpadPreviewParts.css';

/** The story's chapters as listed by Wattpad on New novel: read-only, nothing is fetched or translated here. */
export function WattpadPreviewParts({ parts }: { parts: WattpadPreviewPart[] }) {
  return (
    <section className="wattpad-preview" aria-labelledby="wattpad-preview-heading">
      <h2 id="wattpad-preview-heading" className="wattpad-preview__heading">
        Chapters on Wattpad ({parts.length})
      </h2>
      <p className="meta">Create the novel, then fetch and translate chapters one by one in the Wattpad tab.</p>
      {parts.length === 0 ? (
        <EmptyState icon={ListChecks}>Wattpad lists no parts for this story.</EmptyState>
      ) : (
        <ul className="wattpad-preview__list" aria-label="Chapters on Wattpad">
          {parts.map((p) => (
            <li key={p.partId} className={`wattpad-preview__row${p.deleted ? ' wattpad-preview__row--deleted' : ''}`}>
              <span className="wattpad-preview__title">{p.title}</span>
              <span className="wattpad-preview__meta">
                <span className="meta">{p.wordCount.toLocaleString('en-US')} words</span>
                {p.modifiedAt && <span className="meta">{formatInstant(p.modifiedAt)}</span>}
                {p.deleted && <span className="badge badge--progress">Deleted</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
