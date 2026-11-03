import { Download, FileUp, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { viSrtUrl, type VideoDto } from '../api/client';

interface Props {
  videos: VideoDto[] | null;
  busyId: string | null;
  onReplace: (video: VideoDto, file: File) => void;
  onDelete: (video: VideoDto) => void;
  /** Shown under the list, e.g. the pager. */
  footer?: ReactNode;
}

export function VietsubList({ videos, busyId, onReplace, onDelete, footer }: Props) {
  return (
    <section className="history" aria-label="Quản lý Vietsub">
      <h2 className="history__heading">Quản lý Vietsub</h2>
      {videos === null ? (
        <p className="muted">Đang tải danh sách…</p>
      ) : videos.length === 0 ? (
        <p className="muted">Chưa có video nào có Vietsub. Dán link YouTube và chọn file .srt ở trên để bắt đầu.</p>
      ) : (
        <ul className="history__list">
          {videos.map((v) => {
            const busy = busyId === v.id;
            return (
              <li key={v.id} className="history__item" aria-busy={busy}>
                <span className="history__open history__open--static">
                  <img src={v.thumbnailUrl} alt="" width={96} height={54} loading="lazy" />
                  <span className="history__text">
                    <span className="history__title">{v.title}</span>
                    <span className="history__sub">
                      {v.viCueCount} câu ·{' '}
                      {v.viSource === 'AUTO' ? `Gemini (${v.translationProfile ?? ''})` : 'Tự upload'}
                    </span>
                  </span>
                </span>
                <span className="history__actions">
                  <a
                    className="button button--icon"
                    href={viSrtUrl(v.id)}
                    download
                    aria-label={`Download Vietsub: ${v.title}`}
                    title="Download Vietsub"
                  >
                    <Download className="icon" aria-hidden="true" />
                  </a>
                  <label className="button button--icon" title={busy ? 'Replacing…' : 'Replace Vietsub'}>
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
                  <button
                    className="button button--icon button--danger"
                    type="button"
                    disabled={busy}
                    onClick={() => onDelete(v)}
                    aria-label={`Delete Vietsub: ${v.title}`}
                    title="Delete Vietsub"
                  >
                    <Trash2 className="icon" aria-hidden="true" />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {footer}
    </section>
  );
}
