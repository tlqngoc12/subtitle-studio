import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { getVideo, getVietsub, type ViCue, type VideoDto } from '../api/client';
import { VideoPlayer } from '../components/VideoPlayer';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import { findActiveCue } from '../lib/findActiveCue';
import { useYouTubePlayer } from '../player/useYouTubePlayer';

/** The end result of the workflow: the YouTube video playing with its Vietsub. */
export default function WatchPage() {
  const { id = '' } = useParams();
  const [video, setVideo] = useState<VideoDto | null>(null);
  const [cues, setCues] = useState<ViCue[]>([]);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const player = useYouTubePlayer(playerRef, id);

  useEffect(() => {
    setVideo(null);
    setCues([]);
    setError(null);
    Promise.all([getVideo(id), getVietsub(id)])
      .then(([v, c]) => {
        setVideo(v);
        setCues(c);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  const cue = findActiveCue(cues, player.currentMs);

  return (
    <main className="page">
      <Link className="back-link" to="/vietsub/list">
        ← Vietsub list
      </Link>

      {error && (
        <div className="alert" role="alert">
          <p className="alert__title">{error.title}</p>
          {error.hint && <p className="alert__hint">{error.hint}</p>}
        </div>
      )}

      {video && (
        <header className="masthead">
          <h1 className="masthead__name">{video.title}</h1>
          {video.channel && <p className="masthead__lede">{video.channel}</p>}
        </header>
      )}

      {video && video.viCueCount === 0 && (
        <p className="muted">
          This video has no Vietsub yet. <Link to="/vietsub">Add Vietsub</Link>
        </p>
      )}

      {!error && <VideoPlayer containerRef={playerRef} cue={cue} error={player.error} />}
    </main>
  );
}
