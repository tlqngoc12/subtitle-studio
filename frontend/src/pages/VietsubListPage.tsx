import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { listVideos, type VideoDto } from '../api/client';
import { Pagination } from '../components/Pagination';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import { formatDuration } from '../lib/format';
import { usePagination } from '../lib/usePagination';
import { withVietsub } from '../lib/vietsub';

/** Watch-only list of videos that have Vietsub; managing them happens on /vietsub. */
export default function VietsubListPage() {
  const [videos, setVideos] = useState<VideoDto[] | null>(null);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const pager = usePagination(videos);

  useEffect(() => {
    listVideos()
      .then((all) => setVideos(withVietsub(all)))
      .catch((e) => {
        setVideos([]);
        setError(errorMessage(e));
      });
  }, []);

  return (
    <main className="page">
      <header className="masthead">
        <h1 className="masthead__name">Danh sách Vietsub</h1>
        <p className="masthead__lede">Chọn một video để xem kèm Vietsub.</p>
      </header>

      {error && (
        <div className="alert" role="alert">
          <p className="alert__title">{error.title}</p>
          {error.hint && <p className="alert__hint">{error.hint}</p>}
        </div>
      )}

      <section className="history" aria-label="Danh sách Vietsub">
        {pager.items === null ? (
          <p className="muted">Đang tải danh sách…</p>
        ) : pager.items.length === 0 ? (
          <p className="muted">
            Chưa có video nào có Vietsub. <Link to="/vietsub">Thêm Vietsub</Link>
          </p>
        ) : (
          <ul className="history__list">
            {pager.items.map((v) => {
              const duration = formatDuration(v.durationSec);
              return (
                <li key={v.id} className="history__item">
                  <Link className="history__open" to={`/vietsub/${v.id}`}>
                    <img src={v.thumbnailUrl} alt="" width={160} height={90} loading="lazy" />
                    <span className="history__text">
                      <span className="history__title">{v.title}</span>
                      <span className="history__sub">
                        {[v.channel, duration].filter(Boolean).join(', ')}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <Pagination page={pager.page} pageCount={pager.pageCount} onChange={pager.setPage} />
      </section>
    </main>
  );
}
