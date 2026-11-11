import { CircleCheck, SkipBack, SkipForward } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import type { PublicPlaylistDetail } from '../data/types';
import { useWatched } from '../data/watched';
import { Tip } from './Tip';
import './PlaylistPanel.css';

interface Props {
  playlist: PublicPlaylistDetail;
  /** Index of the video being watched. */
  index: number;
  autoplay: boolean;
  /** The last video has finished. */
  ended: boolean;
  onAutoplayChange: (on: boolean) => void;
  onPrevious: () => void;
  onNext: () => void;
}

/** YouTube-like playlist panel beside the player: position, Previous / Next, Autoplay and the numbered list. */
export function PlaylistPanel({ playlist, index, autoplay, ended, onAutoplayChange, onPrevious, onNext }: Props) {
  const currentRef = useRef<HTMLAnchorElement>(null);
  const count = playlist.videos.length;
  const watched = useWatched();
  const next = playlist.videos[index + 1];

  // Keep the current video in view inside the panel's own scroll area.
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  return (
    <aside className="plpanel" aria-label={`Playlist ${playlist.name}`}>
      <div className="plpanel__head">
        <p className="plpanel__name">{playlist.name}</p>
        <p className="plpanel__position muted">
          {index + 1} / {count}
        </p>
        {next && <p className="plpanel__upnext">{`Up next: ${next.title}`}</p>}
        <div className="plpanel__controls">
          <Tip label="Previous (Shift+P)">
            <button
              className="button button--icon button--s"
              type="button"
              disabled={index === 0}
              onClick={onPrevious}
              aria-label="Previous video"
            >
              <SkipBack className="icon" aria-hidden="true" />
            </button>
          </Tip>
          <Tip label="Next (Shift+N)">
            <button
              className="button button--icon button--s"
              type="button"
              disabled={index === count - 1}
              onClick={onNext}
              aria-label="Next video"
            >
              <SkipForward className="icon" aria-hidden="true" />
            </button>
          </Tip>
          <label className="plpanel__autoplay">
            <input
              type="checkbox"
              role="switch"
              checked={autoplay}
              onChange={(e) => onAutoplayChange(e.target.checked)}
            />
            Autoplay
          </label>
        </div>
        {ended && <p className="plpanel__ended">End of playlist</p>}
      </div>
      <ol className="plpanel__list">
        {playlist.videos.map((v, i) => {
          const current = i === index;
          const seen = !current && watched.has(v.id);
          return (
            <li key={v.id}>
              <Link
                ref={current ? currentRef : undefined}
                className={
                  current ? 'plpanel__item plpanel__item--current' : seen ? 'plpanel__item plpanel__item--watched' : 'plpanel__item'
                }
                to={`/vietsub/${v.id}?playlist=${playlist.id}`}
                state={{ autoplay: true }}
                aria-current={current ? 'true' : undefined}
              >
                <span className="plpanel__lead">
                  <span className="plpanel__index" aria-hidden="true">
                    {current ? '▶' : i + 1}
                  </span>
                  {seen && (
                    <>
                      <CircleCheck className="icon icon--sm plpanel__seen" aria-hidden="true" />
                      <span className="visually-hidden">Watched</span>
                    </>
                  )}
                </span>
                <img src={v.thumbnailUrl} alt="" width={96} height={54} loading="lazy" />
                <span className="plpanel__text">
                  {i === index + 1 && <span className="plpanel__tag">Next</span>}
                  <span className="plpanel__title title-clamp">{v.title}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
