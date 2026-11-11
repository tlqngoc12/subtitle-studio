import { Play } from 'lucide-react';
import { useState } from 'react';
import './TrailerEmbed.css';

/**
 * A YouTube trailer that costs nothing until clicked: a poster with a play button, replaced by the privacy-friendly
 * (youtube-nocookie) player on click. 16:9.
 */
export function TrailerEmbed({ videoId, title }: { videoId: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="trailer">
      {playing ? (
        <iframe
          className="trailer__frame"
          title={`${title} trailer`}
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
          allow="autoplay; encrypted-media"
          allowFullScreen
        />
      ) : (
        <button type="button" className="trailer__poster" aria-label={`Play trailer: ${title}`} onClick={() => setPlaying(true)}>
          <img src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} alt="" loading="lazy" />
          <span className="trailer__play" aria-hidden="true">
            <Play className="icon" />
          </span>
        </button>
      )}
    </div>
  );
}
