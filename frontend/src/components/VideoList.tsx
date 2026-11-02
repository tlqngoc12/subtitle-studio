import { srtUrl, type VideoDto } from '../api/client';
import { formatDuration } from '../lib/format';

interface Props {
  videos: VideoDto[] | null;
  busyId: string | null;
  onOpen: (video: VideoDto) => void;
  onRefresh: (video: VideoDto) => void;
  onDelete: (video: VideoDto) => void;
}

export function VideoList({ videos, busyId, onOpen, onRefresh, onDelete }: Props) {
  return (
    <section className="history" aria-label="Đã lấy trước đó">
      <h2 className="history__heading">Đã lấy trước đó</h2>
      {videos === null ? (
        <p className="muted">Đang tải danh sách…</p>
      ) : videos.length === 0 ? (
        <p className="muted">Chưa có video nào. Dán link YouTube ở khung phía trên để bắt đầu.</p>
      ) : (
        <ul className="history__list">
          {videos.map((v) => {
            const busy = busyId === v.id;
            const duration = formatDuration(v.durationSec);
            return (
              <li key={v.id} className="history__item" aria-busy={busy}>
                <button className="history__open" type="button" onClick={() => onOpen(v)} aria-label={`Mở ${v.title}`}>
                  <img src={v.thumbnailUrl} alt="" width={96} height={54} loading="lazy" />
                  <span className="history__text">
                    <span className="history__title">{v.title}</span>
                    <span className="history__sub">
                      {v.subSource === 'AUTO' ? 'Auto-generated' : 'Manual'}, {v.cueCount} câu
                      {duration ? `, ${duration}` : ''}
                    </span>
                  </span>
                </button>
                <span className="history__actions">
                  <a className="button button--small" href={srtUrl(v.id)} download aria-label={`Tải .srt của ${v.title}`}>
                    Tải .srt
                  </a>
                  <button
                    className="button button--small"
                    type="button"
                    disabled={busy}
                    onClick={() => onRefresh(v)}
                    aria-label={`Làm mới ${v.title}`}
                  >
                    {busy ? 'Đang làm mới…' : 'Làm mới'}
                  </button>
                  <button
                    className="button button--small button--danger"
                    type="button"
                    disabled={busy}
                    onClick={() => onDelete(v)}
                    aria-label={`Xoá ${v.title}`}
                  >
                    Xoá
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
