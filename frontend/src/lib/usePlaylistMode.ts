import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { getPlaylist, type PlaylistDetail } from '../api/playlists';

const AUTOPLAY_KEY = 'subtitle-studio.autoplay';

function readAutoplay(): boolean {
  try {
    return localStorage.getItem(AUTOPLAY_KEY) !== 'off'; // on unless turned off, like YouTube
  } catch {
    return true;
  }
}

function writeAutoplay(on: boolean) {
  try {
    localStorage.setItem(AUTOPLAY_KEY, on ? 'on' : 'off');
  } catch {
    // private window or blocked storage: the choice lasts until the page is closed
  }
}

function parseId(raw: string | null): number | null {
  const n = raw === null ? NaN : Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export interface PlaylistMode {
  playlist: PlaylistDetail;
  index: number;
  autoplay: boolean;
  setAutoplay: (on: boolean) => void;
  /** Opens the video at `index` in playlist mode; it starts playing by itself. */
  go: (index: number) => void;
}

/**
 * Playlist mode of the watch page (`/vietsub/:id?playlist=<id>`). The playlist is loaded once per playlist id,
 * not per video. Null when there is no `?playlist`, it does not exist, or the video is not in it: then the page
 * is the normal watch page.
 */
export function usePlaylistMode(videoId: string): PlaylistMode | null {
  const [params] = useSearchParams();
  const playlistId = parseId(params.get('playlist'));
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState<PlaylistDetail | null>(null);
  const [autoplay, setAutoplayState] = useState(readAutoplay);

  useEffect(() => {
    setPlaylist(null);
    if (playlistId === null) return;
    let cancelled = false;
    getPlaylist(playlistId)
      .then((p) => !cancelled && setPlaylist(p))
      .catch(() => {
        // a stale link: show the normal watch page
      });
    return () => {
      cancelled = true;
    };
  }, [playlistId]);

  const go = useCallback(
    (index: number) => {
      const next = playlist?.videos[index];
      if (next) navigate(`/vietsub/${next.id}?playlist=${playlist.id}`, { state: { autoplay: true } });
    },
    [navigate, playlist],
  );

  const setAutoplay = useCallback((on: boolean) => {
    setAutoplayState(on);
    writeAutoplay(on);
  }, []);

  if (!playlist) return null;
  const index = playlist.videos.findIndex((v) => v.id === videoId);
  if (index < 0) return null;
  return { playlist, index, autoplay, setAutoplay, go };
}
