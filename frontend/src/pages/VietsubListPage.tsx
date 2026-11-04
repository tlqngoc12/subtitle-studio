import { useEffect, useMemo, useState } from 'react';
import { Clock, ListVideo, Search, SearchX, Tv, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { listVideos, type VideoDto } from '../api/client';
import { getPlaylist, listPlaylists, type PlaylistDetail, type PlaylistSummary } from '../api/playlists';
import { EmptyState } from '../components/EmptyState';
import { Pagination } from '../components/Pagination';
import { PlaylistChips } from '../components/PlaylistChips';
import { PlaylistHeader } from '../components/PlaylistHeader';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import { formatDuration } from '../lib/format';
import { usePagination } from '../lib/usePagination';
import { matchesSearch } from '../lib/search';
import { withVietsub } from '../lib/vietsub';

/** A row of the list; `position` is the video's number in the chosen playlist (null in All). */
interface Entry {
  video: VideoDto;
  position: number | null;
}

function parsePlaylistId(raw: string | null): number | null {
  const n = raw === null ? NaN : Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Watch-only list of videos that have Vietsub (managing them happens on /vietsub): search, All or one playlist
 * in its order. `?playlist=`, `?q=` and `?page=` keep the view so Back from a video returns to it.
 */
export default function VietsubListPage() {
  const [params, setParams] = useSearchParams();
  const requestedPlaylist = parsePlaylistId(params.get('playlist'));
  const query = params.get('q') ?? '';
  const [videos, setVideos] = useState<VideoDto[] | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  // The loaded playlist, or 'missing' when the id in the URL does not exist (then the page shows All).
  const [playlist, setPlaylist] = useState<PlaylistDetail | 'missing' | null>(null);
  const [error, setError] = useState<ErrorMessage | null>(null);

  useEffect(() => {
    listVideos()
      .then((all) => setVideos(withVietsub(all)))
      .catch((e) => {
        setVideos([]);
        setError(errorMessage(e));
      });
    // The chips are extra: without them the list still works, so a failure here stays quiet.
    listPlaylists()
      .then(setPlaylists)
      .catch(() => setPlaylists([]));
  }, []);

  useEffect(() => {
    setPlaylist(null);
    if (requestedPlaylist === null) return;
    let cancelled = false;
    getPlaylist(requestedPlaylist)
      .then((p) => !cancelled && setPlaylist(p))
      .catch(() => !cancelled && setPlaylist('missing'));
    return () => {
      cancelled = true;
    };
  }, [requestedPlaylist]);

  const active = playlist !== null && playlist !== 'missing' ? playlist : null;
  const waitingForPlaylist = requestedPlaylist !== null && playlist === null;

  const entries = useMemo<Entry[] | null>(() => {
    if (videos === null || waitingForPlaylist) return null;
    const scope: Entry[] = active
      ? active.videos.map((video, i) => ({ video, position: i + 1 }))
      : videos.map((video) => ({ video, position: null }));
    return scope.filter((e) => matchesSearch(e.video, query));
  }, [videos, waitingForPlaylist, active, query]);
  const pager = usePagination(entries);

  function setQuery(next: string) {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete('page');
        if (next) p.set('q', next);
        else p.delete('q');
        return p;
      },
      { replace: true },
    );
  }

  const linkFor = (e: Entry) => (active ? `/vietsub/${e.video.id}?playlist=${active.id}` : `/vietsub/${e.video.id}`);

  function emptyState() {
    if (query.trim()) {
      return <EmptyState icon={SearchX}>No videos match "{query}".</EmptyState>;
    }
    if (active) {
      return (
        <EmptyState icon={ListVideo}>
          This playlist has no videos yet. <Link to={`/vietsub/playlists/${active.id}`}>Manage playlist</Link>
        </EmptyState>
      );
    }
    return (
      <EmptyState icon={ListVideo}>
        No videos with Vietsub yet. <Link to="/vietsub">Add Vietsub</Link>
      </EmptyState>
    );
  }

  return (
    <main className="page">
      <header className="masthead">
        <h1 className="masthead__name">Vietsub list</h1>
        <p className="masthead__lede">Choose a video to watch with Vietsub.</p>
      </header>

      <div className="searchbar">
        <Search className="icon searchbar__icon" aria-hidden="true" />
        <input
          type="search"
          className="searchbar__input"
          placeholder="Search videos"
          aria-label="Search videos"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className="button button--icon searchbar__clear" type="button" aria-label="Clear search" onClick={() => setQuery('')}>
            <X className="icon" aria-hidden="true" />
          </button>
        )}
      </div>

      {(playlists.length > 0 || requestedPlaylist !== null) && (
        <PlaylistChips allCount={videos?.length ?? 0} playlists={playlists} current={active ? active.id : null} />
      )}

      {active && <PlaylistHeader playlist={active} />}

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
          emptyState()
        ) : (
          <ul className="history__list">
            {pager.items.map((e) => {
              const v = e.video;
              const duration = formatDuration(v.durationSec);
              return (
                <li key={v.id} className="history__item">
                  <Link className="history__open history__open--row" to={linkFor(e)}>
                    {e.position !== null && <span className="vlist__index">{e.position}</span>}
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
