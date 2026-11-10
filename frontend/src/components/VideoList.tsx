import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Captions, Clock, Download, Languages, MonitorPlay, Play, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { srtUrl, type VideoDto } from '../api/client';
import { formatDuration } from '../lib/format';
import { rowMotion } from '../lib/motion';
import { EmptyState } from './EmptyState';
import { Tip } from './Tip';
import { LoadingText } from './ui/LoadingText';

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
}

export function VideoList({ videos, busyId, onOpen, onDelete, highlightId, listKey, footer }: Props) {
  return (
    <section className="history" aria-label="Fetched earlier">
      <h2 className="history__heading">Fetched earlier</h2>
      {videos === null ? (
        <LoadingText>Loading list…</LoadingText>
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
                        <Link className="button button--icon" to={`/vietsub/${v.id}`} aria-label={`Watch Video: ${v.title}`}>
                          <Play className="icon" aria-hidden="true" />
                        </Link>
                      </Tip>
                    )}
                    <Tip label="Download Engsub">
                      <a className="button button--icon" href={srtUrl(v.id)} download aria-label={`Download Engsub: ${v.title}`}>
                        <Download className="icon" aria-hidden="true" />
                      </a>
                    </Tip>
                    <Tip label="Delete">
                      <button
                        className="button button--icon button--danger"
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
