import { Captions, Download, FilePlus, FileUp, Languages, SearchX, Trash2 } from 'lucide-react';
import { SkeletonList } from './ui/Skeleton';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { viSrtUrl, type VideoDto } from '../api/client';
import { rowMotion } from '../lib/motion';
import { EditStatusIcon } from './EditStatusIcon';
import { EmptyState } from './EmptyState';
import { SaveToPlaylist } from './SaveToPlaylist';
import { Tip } from './Tip';

interface Props {
  videos: VideoDto[] | null;
  busyId: string | null;
  onReplace: (video: VideoDto, file: File) => void;
  onDelete: (video: VideoDto) => void;
  /** The row to flash once, e.g. the video whose Vietsub was just replaced. */
  highlightId?: string | null;
  /** Changes when another page is shown, so its rows appear without enter/exit animations. */
  listKey?: number;
  /** Search and filter controls shown above the list. */
  toolbar?: ReactNode;
  /** True when a search or filter is applied, so an empty list means "nothing matches" rather than "no Vietsub yet". */
  filtered?: boolean;
  /** Shown under the list, e.g. the pager. */
  footer?: ReactNode;
}

export function VietsubList({ videos, busyId, onReplace, onDelete, highlightId, listKey, toolbar, filtered, footer }: Props) {
  return (
    <section className="history" aria-label="Manage Vietsub">
      <h2 className="history__heading visually-hidden">Manage Vietsub</h2>
      {toolbar}
      {videos === null ? (
        <SkeletonList rows={6} />
      ) : videos.length === 0 && filtered ? (
        <EmptyState icon={SearchX}>No videos match your search.</EmptyState>
      ) : videos.length === 0 ? (
        <EmptyState icon={FilePlus}>
          No videos with Vietsub yet.
        </EmptyState>
      ) : (
        <ul className="history__list" key={listKey}>
          <AnimatePresence initial={false}>
            {videos.map((v) => {
              const busy = busyId === v.id;
              return (
                <motion.li
                  key={v.id}
                  {...rowMotion}
                  className={v.id === highlightId ? 'history__item history__item--new' : 'history__item'}
                  aria-busy={busy}
                >
                  {/* The row (up to the action buttons) opens the Vietsub editor. */}
                  <Link className="history__open history__open--row" to={`/vietsub/${v.id}/edit`}>
                    <img src={v.thumbnailUrl} alt="" width={96} height={54} loading="lazy" />
                    <span className="history__text">
                      <span className="history__title title-clamp">{v.title}</span>
                      <span className="history__sub">
                        <span className="meta">
                          <Captions className="icon icon--sm" aria-hidden="true" />
                          {v.viCueCount} lines
                        </span>
                        {v.viSource === 'AUTO' ? (
                          <span className="meta">
                            <Languages className="icon icon--sm" aria-hidden="true" />
                            AI
                          </span>
                        ) : (
                          <span className="meta">
                            <FileUp className="icon icon--sm" aria-hidden="true" />
                            Manual
                            <EditStatusIcon status={v.editStatus} />
                          </span>
                        )}
                      </span>
                    </span>
                  </Link>
                  <span className="history__actions">
                    <SaveToPlaylist video={v} />
                    <Tip label="Download Vietsub">
                      <a className="button button--icon button--s" href={viSrtUrl(v.id)} download aria-label={`Download Vietsub: ${v.title}`}>
                        <Download className="icon" aria-hidden="true" />
                      </a>
                    </Tip>
                    <Tip label={busy ? 'Replacing…' : 'Replace Vietsub'}>
                      <label className="button button--icon button--s">
                        <FileUp className="icon" aria-hidden="true" />
                        <input
                          className="visually-hidden"
                          type="file"
                          accept=".srt"
                          disabled={busy}
                          aria-label={`Replace Vietsub: ${v.title}`}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (file) onReplace(v, file);
                          }}
                        />
                      </label>
                    </Tip>
                    <Tip label="Delete Vietsub">
                      <button
                        className="button button--icon button--s button--danger"
                        type="button"
                        disabled={busy}
                        onClick={() => onDelete(v)}
                        aria-label={`Delete Vietsub: ${v.title}`}
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
