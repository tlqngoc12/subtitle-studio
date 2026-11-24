import type { ReactNode } from 'react';
import { SkeletonList } from './ui/Skeleton';
import { Link } from 'react-router';
import { Captions, Clock, Download, FileUp, Languages, MonitorPlay, Pencil, Play, SearchX, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { srtUrl, type VideoDto } from '../api/client';
import { formatDuration } from '../lib/format';
import { rowMotion } from '../lib/motion';
import { EditStatusIcon } from './EditStatusIcon';
import { EmptyState } from './EmptyState';
import { Tip } from './Tip';

interface Props {
  videos: VideoDto[] | null;
  busyId: string | null;
  onOpen: (video: VideoDto) => void;
  onDelete: (video: VideoDto) => void;
  /** The row to flash once, e.g. the video just fetched. */
  highlightId?: string | null;
  /** Changes when another page is shown, so its rows appear without enter/exit animations. */
  listKey?: number;
  /** Shown under the list, e.g. the pager. */
  footer?: ReactNode;
  /** The search shown under the heading. */
  toolbar?: ReactNode;
  /** True when a search is applied, so an empty list means "nothing matches" rather than "no videos yet". */
  filtered?: boolean;
}

export function VideoList({ videos, busyId, onOpen, onDelete, highlightId, listKey, footer, toolbar, filtered }: Props) {
  return (
    <section className="history" aria-label="Fetched earlier">
      <h2 className="history__heading">Fetched earlier</h2>
      {toolbar}
      {videos === null ? (
        <SkeletonList rows={6} />
      ) : videos.length === 0 && filtered ? (
        <EmptyState icon={SearchX}>No videos match your search.</EmptyState>
      ) : videos.length === 0 ? (
        <EmptyState icon={MonitorPlay}>No videos yet. Paste a YouTube link above to start.</EmptyState>
      ) : (
        <ul className="history__list" key={listKey}>
          <AnimatePresence initial={false}>
            {videos.map((v) => {
              const busy = busyId === v.id;
              const duration = formatDuration(v.durationSec);
              return (
                <motion.li
                  key={v.id}
                  {...rowMotion}
                  className={v.id === highlightId ? 'history__item history__item--new' : 'history__item'}
                  aria-busy={busy}
                >
                  <button className="history__open" type="button" onClick={() => onOpen(v)} aria-label={`Open ${v.title}`}>
                    <img src={v.thumbnailUrl} alt="" width={96} height={54} loading="lazy" />
                    <span className="history__text">
                      <span className="history__title title-clamp">{v.title}</span>
                      <span className="history__sub">
                        <span className="meta">
                          <Captions className="icon icon--sm" aria-hidden="true" />
                          {v.cueCount} lines
                        </span>
                        {duration && (
                          <span className="meta">
                            <Clock className="icon icon--sm" aria-hidden="true" />
                            {duration}
                          </span>
                        )}
                        {v.viCueCount > 0 &&
                          (v.viSource === 'AUTO' ? (
                            <span className="meta">
                              <Languages className="icon icon--sm" aria-hidden="true" />
                              AI
                              <EditStatusIcon status={v.editStatus} />
                            </span>
                          ) : (
                            <span className="meta">
                              <FileUp className="icon icon--sm" aria-hidden="true" />
                              Manual
                              <EditStatusIcon status={v.editStatus} />
                            </span>
                          ))}
                        {v.translationStatus === 'TRANSLATING' && (
                          <span className="meta">
                            <Languages className="icon icon--sm" aria-hidden="true" />
                            Translating…
                          </span>
                        )}
                        {v.translationStatus === 'FAILED' && (
                          <span className="meta meta--error">
                            <Languages className="icon icon--sm" aria-hidden="true" />
                            Translation failed
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                  <span className="history__actions">
                    {v.viCueCount > 0 && (
                      <Tip label="Watch Video">
                        <Link className="button button--icon button--s" to={`/vietsub/${v.id}`} aria-label={`Watch Video: ${v.title}`}>
                          <Play className="icon" aria-hidden="true" />
                        </Link>
                      </Tip>
                    )}
                    {v.viCueCount > 0 && (
                      <Tip label="Edit Vietsub">
                        <Link className="button button--icon button--s" to={`/vietsub/${v.id}/edit`} aria-label={`Edit Vietsub: ${v.title}`}>
                          <Pencil className="icon" aria-hidden="true" />
                        </Link>
                      </Tip>
                    )}
                    <Tip label="Download Engsub">
                      <a className="button button--icon button--s" href={srtUrl(v.id)} download aria-label={`Download Engsub: ${v.title}`}>
                        <Download className="icon" aria-hidden="true" />
                      </a>
                    </Tip>
                    <Tip label="Delete">
                      <button
                        className="button button--icon button--s button--danger"
                        type="button"
                        disabled={busy}
                        onClick={() => onDelete(v)}
                        aria-label={`Delete ${v.title}`}
                      >
                        <Trash2 className="icon" aria-hidden="true" />
                      </button>
                    </Tip>
                  </span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
      {footer}
    </section>
  );
}
