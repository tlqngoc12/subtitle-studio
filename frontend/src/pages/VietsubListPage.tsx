import * as Tabs from '@radix-ui/react-tabs';
import { ArrowLeft, CircleCheck, Clock, ListVideo, SearchX, Tv } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { EmptyState } from '../components/EmptyState';
import { Pagination } from '../components/Pagination';
import { PlaylistHeader } from '../components/PlaylistHeader';
import { useSite } from '../data/SiteContext';
import type { PublicPlaylistDetail, PublicPlaylistSummary, PublicVideo } from '../data/types';
import { useWatched } from '../data/watched';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import { formatDuration } from '../lib/format';
import { matchesSearch } from '../lib/search';
import { usePagination } from '../lib/usePagination';
import { withVietsub } from '../lib/vietsub';
import { Alert } from '../components/ui/Alert';
import { LoadingText } from '../components/ui/LoadingText';
import { PageHeader } from '../components/ui/PageHeader';
import { SearchBar } from '../components/ui/SearchBar';
import './VietsubListPage.css';

/** A row of a video list; `position` is the video's number in the open playlist (null in All videos). */
interface Entry {
  video: PublicVideo;
  position: number | null;
}

type Tab = 'playlists' | 'all';

function parsePlaylistId(raw: string | null): number | null {
  const n = raw === null ? NaN : Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Watch-only list of videos that have Vietsub (managing them happens on /vietsub), in two tabs:
 * Playlists (default; cards, searched by playlist name or by the videos inside) and All videos.
 * `?playlist=<id>` opens one playlist. `?tab=all`, `?playlist=`, `?q=` and `?page=` keep the view in the URL,
 * so Back from a video returns to it.
 */
export default function VietsubListPage() {
  const [params, setParams] = useSearchParams();
  const { source, readOnly } = useSite();
  const requestedPlaylist = parsePlaylistId(params.get('playlist'));
  const tab: Tab = params.get('tab') === 'all' ? 'all' : 'playlists';
  const query = params.get('q') ?? '';
  // The opened playlist, or 'missing' when the id in the URL does not exist (then the tabs show).
  const [playlist, setPlaylist] = useState<PublicPlaylistDetail | 'missing' | null>(null);
  // Loaded once for the page: switching tabs must not load again (the list would collapse to "Loading…").
  const [videos, setVideos] = useState<PublicVideo[] | null>(null);
  const [videosError, setVideosError] = useState<ErrorMessage | null>(null);
  const [playlists, setPlaylists] = useState<PublicPlaylistDetail[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    source
      .listVideos()
      .then((all) => !cancelled && setVideos(withVietsub(all)))
      .catch((e) => {
        if (cancelled) return;
        setVideos([]);
        setVideosError(errorMessage(e, { readOnly }));
      });
    source
      .listPlaylists()
      .then((list: PublicPlaylistSummary[]) =>
        Promise.all(list.map((p) => source.getPlaylist(p.id).catch(() => null))),
      )
      .then((details) => !cancelled && setPlaylists(details.filter((d): d is PublicPlaylistDetail => d !== null)))
      .catch(() => !cancelled && setPlaylists([]));
    return () => {
      cancelled = true;
    };
  }, [source, readOnly]);

  useEffect(() => {
    setPlaylist(null);
    if (requestedPlaylist === null) return;
    let cancelled = false;
    source
      .getPlaylist(requestedPlaylist)
      .then((p) => !cancelled && setPlaylist(p))
      .catch(() => !cancelled && setPlaylist('missing'));
    return () => {
      cancelled = true;
    };
  }, [requestedPlaylist, source]);

  const active = playlist !== null && playlist !== 'missing' ? playlist : null;
  const waitingForPlaylist = requestedPlaylist !== null && playlist === null;

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

  /** Another tab starts on page 1 and keeps the search. */
  function setTab(next: string) {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      p.delete('page');
      p.delete('playlist');
      if (next === 'all') p.set('tab', 'all');
      else p.delete('tab');
      return p;
    });
  }

  const backToPlaylists = query ? `/vietsub/list?${new URLSearchParams({ q: query })}` : '/vietsub/list';
  const searchLabel = !active && !waitingForPlaylist && tab === 'playlists' ? 'Search playlists and videos' : 'Search videos';

  return (
    <main className="page">
      <PageHeader title="Vietsub list" lede="Choose a video to watch with Vietsub." />

      {active && (
        <Link className="back-link" to={backToPlaylists}>
          <ArrowLeft className="icon icon--sm" aria-hidden="true" />
          Back to Playlists
        </Link>
      )}

      <SearchBar value={query} onChange={setQuery} label={searchLabel} onClear={() => setQuery('')} />

      {waitingForPlaylist ? (
        <LoadingText>Loading playlist…</LoadingText>
      ) : active ? (
        <>
          <PlaylistHeader playlist={active} />
          <VideoSection
            entries={active.videos.map((video, i) => ({ video, position: i + 1 }))}
            query={query}
            linkFor={(e) => `/vietsub/${e.video.id}?playlist=${active.id}`}
            empty={
              <EmptyState icon={ListVideo}>
                This playlist has no videos yet.
                {!readOnly && <> <Link to={`/vietsub/playlists/${active.id}`}>Manage playlist</Link></>}
              </EmptyState>
            }
          />
        </>
      ) : (
        <Tabs.Root value={tab} onValueChange={setTab} className="tabs">
          <Tabs.List className="tabs__list" aria-label="Vietsub list views">
            <Tabs.Trigger className="tabs__tab" value="playlists">
              Playlists
            </Tabs.Trigger>
            <Tabs.Trigger className="tabs__tab" value="all">
              All videos
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="playlists">
            <PlaylistsTab query={query} playlists={playlists} />
          </Tabs.Content>
          <Tabs.Content value="all">
            <AllVideosTab query={query} videos={videos} error={videosError} />
          </Tabs.Content>
        </Tabs.Root>
      )}
    </main>
  );
}

/** Every video with Vietsub, newest Vietsub first (loaded by the page). */
function AllVideosTab({ query, videos, error }: { query: string; videos: PublicVideo[] | null; error: ErrorMessage | null }) {
  return (
    <>
      {error && (
        <Alert title={error.title} hint={error.hint} />
      )}
      <VideoSection
        entries={videos?.map((video) => ({ video, position: null })) ?? null}
        query={query}
        linkFor={(e) => `/vietsub/${e.video.id}`}
        empty={
          <EmptyState icon={ListVideo}>
            No videos with Vietsub yet.
          </EmptyState>
        }
      />
    </>
  );
}

/**
 * Playlist cards. With a search, a playlist shows when its name matches or any of its videos does; the count
 * is then the matching videos (or the whole playlist when only the name matched).
 */
function PlaylistsTab({ query, playlists }: { query: string; playlists: PublicPlaylistDetail[] | null }) {
  const { readOnly } = useSite();

  const cards = useMemo(() => {
    if (playlists === null) return null;
    if (!query.trim()) return playlists.map((playlist) => ({ playlist, count: undefined as number | undefined }));
    return playlists.flatMap((playlist) => {
      const matching = playlist.videos.filter((v) => matchesSearch(v, query)).length;
      const nameMatches = matchesSearch({ title: playlist.name, channel: null }, query);
      if (matching === 0 && !nameMatches) return [];
      return [{ playlist, count: matching > 0 ? matching : undefined }];
    });
  }, [playlists, query]);
  const pager = usePagination(cards);

  return (
    <section className="plcards" aria-label="Playlists">
      {pager.items === null ? (
        <LoadingText>Loading playlists…</LoadingText>
      ) : pager.items.length === 0 ? (
        query.trim() ? (
          <EmptyState icon={SearchX}>No playlists match "{query}".</EmptyState>
        ) : (
          <EmptyState icon={ListVideo}>
            No playlists yet.{!readOnly && <> <Link to="/vietsub/playlists">Create a playlist</Link></>}
          </EmptyState>
        )
      ) : (
        pager.items.map(({ playlist, count }) => (
          <PlaylistHeader key={playlist.id} playlist={playlist} count={count} href={`/vietsub/list?playlist=${playlist.id}`} />
        ))
      )}
      <Pagination page={pager.page} pageCount={pager.pageCount} onChange={pager.setPage} />
    </section>
  );
}

/** A searchable, paged list of video rows (All videos, or one playlist with its numbers). */
function VideoSection({
  entries,
  query,
  linkFor,
  empty,
}: {
  entries: Entry[] | null;
  query: string;
  linkFor: (e: Entry) => string;
  empty: ReactNode;
}) {
  const filtered = useMemo(
    () => (entries === null ? null : entries.filter((e) => matchesSearch(e.video, query))),
    [entries, query],
  );
  const pager = usePagination(filtered);
  const watched = useWatched();

  return (
    <section className="history" aria-label="Vietsub list">
      {pager.items === null ? (
        <LoadingText>Loading list…</LoadingText>
      ) : pager.items.length === 0 ? (
        query.trim() ? <EmptyState icon={SearchX}>No videos match "{query}".</EmptyState> : empty
      ) : (
        <ul className="history__list">
          {pager.items.map((e) => {
            const v = e.video;
            const duration = formatDuration(v.durationSec);
            return (
              <li key={v.id} className={watched.has(v.id) ? 'history__item history__item--watched' : 'history__item'}>
                <Link className="history__open history__open--row" to={linkFor(e)}>
                  {e.position !== null && <span className="vlist__index">{e.position}</span>}
                  <img src={v.thumbnailUrl} alt="" width={160} height={90} loading="lazy" />
                  <span className="history__text">
                    <span className="history__title title-clamp">{v.title}</span>
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
                      {watched.has(v.id) && (
                        <span className="meta meta--watched">
                          <CircleCheck className="icon icon--sm" aria-hidden="true" />
                          Watched
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
  );
}
