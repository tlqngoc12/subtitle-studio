import { ListVideo, Play } from 'lucide-react';
import { Link } from 'react-router';
import { videoCountLabel } from '../api/playlists';
import type { PublicPlaylistDetail } from '../data/types';

interface Props {
  playlist: PublicPlaylistDetail;
  /** When set, this is a card in the Playlists tab: the whole card opens `href`. */
  href?: string;
  /** Shown instead of the playlist's own count, e.g. the videos matching a search. */
  count?: number;
}

const PREVIEW = 3;

/** YouTube-like playlist card: cover (first video), name, description, count and Play all. */
export function PlaylistHeader({ playlist, href, count }: Props) {
  const first = playlist.videos[0];
  // A card without a description previews its first videos instead of leaving the space empty.
  const preview = href && !playlist.description ? playlist.videos.slice(0, PREVIEW) : [];
  return (
    <section className={href ? 'plcard plcard--link' : 'plcard'} aria-label={`Playlist ${playlist.name}`}>
      {first ? (
        <img className="plcard__cover" src={first.thumbnailUrl} alt="" width={320} height={180} />
      ) : (
        <span className="plcard__cover plcard__cover--empty" aria-hidden="true">
          <ListVideo className="icon" />
        </span>
      )}
      <div className="plcard__body">
        {/* In a card the name's link stretches over the whole card (CSS); Play all sits above it. */}
        <h2 className="plcard__name">{href ? <Link to={href}>{playlist.name}</Link> : playlist.name}</h2>
        {playlist.description && <p className="plcard__description">{playlist.description}</p>}
        {preview.length > 0 && (
          <ol className="plcard__preview" aria-label="First videos">
            {preview.map((v) => (
              <li key={v.id} className="title-clamp">{v.title}</li>
            ))}
          </ol>
        )}
        <p className="muted">{videoCountLabel(count ?? playlist.videos.length)}</p>
        {first && (
          <Link
            className="button button--primary plcard__play"
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
