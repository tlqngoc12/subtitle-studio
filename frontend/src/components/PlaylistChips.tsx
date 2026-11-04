import { Link } from 'react-router';
import type { PlaylistSummary } from '../api/playlists';

interface Props {
  allCount: number;
  playlists: PlaylistSummary[];
  /** The chosen playlist, or null for All. */
  current: number | null;
}

/** All (n) · Playlist (n) …; picking one starts again from page 1 without a search. Scrolls sideways on phones. */
export function PlaylistChips({ allCount, playlists, current }: Props) {
  return (
    <nav className="chips" aria-label="Playlists">
      <Link className="chip" to="/vietsub/list" aria-current={current === null ? 'page' : undefined}>
        All ({allCount})
      </Link>
      {playlists.map((p) => (
        <Link
          key={p.id}
          className="chip"
          to={`/vietsub/list?playlist=${p.id}`}
          aria-current={current === p.id ? 'page' : undefined}
        >
          {p.name} ({p.videoCount})
        </Link>
      ))}
    </nav>
  );
}
