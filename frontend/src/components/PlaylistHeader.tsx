import { ListVideo, Play } from 'lucide-react';
import { Link } from 'react-router';
import { videoCountLabel } from '../api/playlists';
import type { PublicPlaylistDetail } from '../data/types';

interface Props {
  playlist: PublicPlaylistDetail;
  /** When set, the cover and the name link here (a card in the Playlists tab). */
  href?: string;
  /** Shown instead of the playlist's own count, e.g. the videos matching a search. */
  count?: number;
}

/** YouTube-like playlist card: cover (first video), name, description, count and Play all. */
export function PlaylistHeader({ playlist, href, count }: Props) {
  const first = playlist.videos[0];
  const cover = first ? (
    <img className="plcard__cover" src={first.thumbnailUrl} alt="" width={320} height={180} />
  ) : (
    <span className="plcard__cover plcard__cover--empty" aria-hidden="true">
      <ListVideo className="icon" />
    </span>
  );
  return (
    <section className="plcard" aria-label={`Playlist ${playlist.name}`}>
      {href ? (
        <Link to={href} tabIndex={-1} aria-hidden="true" className="plcard__coverlink">
          {cover}
        </Link>
      ) : (
        cover
      )}
      <div className="plcard__body">
        <h2 className="plcard__name">{href ? <Link to={href}>{playlist.name}</Link> : playlist.name}</h2>
        {playlist.description && <p className="plcard__description">{playlist.description}</p>}
        <p className="muted">{videoCountLabel(count ?? playlist.videos.length)}</p>
        {first && (
          <Link
            className="button button--primary"
            to={`/vietsub/${first.id}?playlist=${playlist.id}`}
            state={{ autoplay: true }}
          >
            <Play className="icon" aria-hidden="true" />
            Play all
          </Link>
        )}
      </div>
    </section>
  );
}
