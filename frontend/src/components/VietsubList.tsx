import type { VideoDto } from '../api/client';

interface Props {
  videos: VideoDto[] | null;
  busyId: string | null;
  onReplace: (video: VideoDto, file: File) => void;
  onDelete: (video: VideoDto) => void;
}

export function VietsubList({ videos, busyId, onReplace, onDelete }: Props) {
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
                    <span className="history__sub">{v.viCueCount} câu</span>
                  </span>
                </span>
                <span className="history__actions">
                  <label className="button button--small">
                    {busy ? 'Đang thay…' : 'Thay Vietsub'}
                    <input
                      className="visually-hidden"
                      type="file"
                      accept=".srt"
                      disabled={busy}
                      aria-label={`Thay Vietsub của ${v.title}`}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) onReplace(v, file);
                      }}
                    />
                  </label>
                  <button
                    className="button button--small button--danger"
                    type="button"
                    disabled={busy}
                    onClick={() => onDelete(v)}
                    aria-label={`Xoá Vietsub của ${v.title}`}
                  >
                    Xoá Vietsub
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
