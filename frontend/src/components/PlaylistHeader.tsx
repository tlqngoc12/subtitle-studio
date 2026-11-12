import { ListVideo, Play, StepForward } from 'lucide-react';
import { Link } from 'react-router';
import { videoCountLabel } from '../api/playlists';
import type { PublicPlaylistDetail } from '../data/types';
import { continueIndex, useWatched } from '../data/watched';
import { useT } from '../lib/i18n';
import { useSite } from '../data/SiteContext';
import './PlaylistHeader.css';

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
  const t = useT();
  const { readOnly } = useSite();
  const first = playlist.videos[0];
  const resume = continueIndex(playlist.videos, useWatched());
  const resumeVideo = resume === null ? undefined : playlist.videos[resume];
  // A card without a description previews its first videos instead of leaving the space empty.
  const preview = href && !playlist.description ? playlist.videos.slice(0, PREVIEW) : [];
  return (
    <section className={href ? 'plcard plcard--link' : 'plcard'} aria-label={t(`Playlist ${playlist.name}`, `Danh sách phát ${playlist.name}`)}>
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
          <ol className="plcard__preview" aria-label={t('First videos', 'Các video đầu tiên')}>
            {preview.map((v) => (
              <li key={v.id} className="title-clamp">{v.title}</li>
            ))}
          </ol>
        )}
        <div className="plcard__foot">
          <p className="muted">{videoCountLabel(count ?? playlist.videos.length, readOnly)}</p>
          {first && (
            <div className="plcard__actions">
              <Link
                className="button button--primary plcard__play"
                to={`/vietsub/${first.id}?playlist=${playlist.id}`}
                state={{ autoplay: true }}
              >
                <Play className="icon" aria-hidden="true" />
                {t('Play all', 'Phát tất cả')}
              </Link>
              {resumeVideo && resume !== null && (
                <Link
                  className="button plcard__play"
                  to={`/vietsub/${resumeVideo.id}?playlist=${playlist.id}`}
                  state={{ autoplay: true }}
                >
                  <StepForward className="icon" aria-hidden="true" />
                  {t(`Continue: EP ${resume + 1}`, `Xem tiếp: tập ${resume + 1}`)}
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
