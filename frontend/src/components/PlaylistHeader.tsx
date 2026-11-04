import { ListVideo, Play } from 'lucide-react';
import { Link } from 'react-router';
import { videoCountLabel, type PlaylistDetail } from '../api/playlists';

/** YouTube-like playlist header: cover (first video), name, description, count and Play all. */
export function PlaylistHeader({ playlist }: { playlist: PlaylistDetail }) {
  const first = playlist.videos[0];
  return (
    <section className="plcard" aria-label={`Playlist ${playlist.name}`}>
      {first ? (
        <img className="plcard__cover" src={first.thumbnailUrl} alt="" width={320} height={180} />
      ) : (
        <span className="plcard__cover plcard__cover--empty" aria-hidden="true">
          <ListVideo className="icon" />
        </span>
      )}
      <div className="plcard__body">
        <h2 className="plcard__name">{playlist.name}</h2>
        {playlist.description && <p className="plcard__description">{playlist.description}</p>}
        <p className="muted">{videoCountLabel(playlist.videos.length)}</p>
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
