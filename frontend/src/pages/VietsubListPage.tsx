import { useEffect, useState } from 'react';
import { Clock, ListVideo, Tv } from 'lucide-react';
import { Link } from 'react-router';
import { listVideos, type VideoDto } from '../api/client';
import { EmptyState } from '../components/EmptyState';
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
        <h1 className="masthead__name">Vietsub list</h1>
        <p className="masthead__lede">Choose a video to watch with Vietsub.</p>
      </header>

      {error && (
        <div className="alert" role="alert">
          <p className="alert__title">{error.title}</p>
          {error.hint && <p className="alert__hint">{error.hint}</p>}
        </div>
      )}

      <section className="history" aria-label="Vietsub list">
        {pager.items === null ? (
          <p className="muted">Loading list…</p>
        ) : pager.items.length === 0 ? (
          <EmptyState icon={ListVideo}>
            No videos with Vietsub yet. <Link to="/vietsub">Add Vietsub</Link>
          </EmptyState>
        ) : (
          <ul className="history__list">
            {pager.items.map((v) => {
              const duration = formatDuration(v.durationSec);
              return (
                <li key={v.id} className="history__item">
                  <Link className="history__open history__open--row" to={`/vietsub/${v.id}`}>
                    <img src={v.thumbnailUrl} alt="" width={160} height={90} loading="lazy" />
                    <span className="history__text">
                      <span className="history__title">{v.title}</span>
                      <span className="history__sub">
                        {v.channel && (
                          <span className="meta">
                            <Tv className="icon icon--sm" aria-hidden="true" />
                            {v.channel}
                          </span>
                        )}
                        {duration && (
                          <span className="meta">
                            <Clock className="icon icon--sm" aria-hidden="true" />
                            {duration}
                          </span>
                        )}
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
