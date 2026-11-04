import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import type { ViCue } from '../api/client';
import { useSite } from '../data/SiteContext';
import type { PublicVideo } from '../data/types';
import { PlaylistPanel } from '../components/PlaylistPanel';
import { VideoPlayer } from '../components/VideoPlayer';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import { findActiveCue } from '../lib/findActiveCue';
import { isTyping } from '../lib/keyboard';
import { usePlaylistMode } from '../lib/usePlaylistMode';
import { useYouTubePlayer } from '../player/useYouTubePlayer';

/**
 * The end result of the workflow: the YouTube video playing with its Vietsub. With `?playlist=` it also shows
 * the playlist panel, plays the next video when one ends (Autoplay) and answers Shift+N / Shift+P.
 */
export default function WatchPage() {
  const { id = '' } = useParams();
  const { source, readOnly } = useSite();
  const [video, setVideo] = useState<PublicVideo | null>(null);
  const [cues, setCues] = useState<ViCue[]>([]);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const startPlaying = (location.state as { autoplay?: boolean } | null)?.autoplay === true;
  const player = useYouTubePlayer(playerRef, id, { autoplay: startPlaying });
  const mode = usePlaylistMode(id);
  const isLast = mode !== null && mode.index === mode.playlist.videos.length - 1;

  useEffect(() => {
    setVideo(null);
    setCues([]);
    setError(null);
    Promise.all([source.getVideo(id), source.getVietsub(id)])
      .then(([v, c]) => {
        setVideo(v);
        setCues(c);
      })
      .catch((e) => setError(errorMessage(e, { readOnly })));
  }, [id, source, readOnly]);

  // Autoplay: when a video ends, go straight to the next one (no countdown), and stop after the last.
  const ended = player.state === 'ended';
  useEffect(() => {
    if (ended && mode && mode.autoplay && !isLast) mode.go(mode.index + 1);
  }, [ended, mode, isLast]);

  useEffect(() => {
    if (!mode) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === 'n' && !isLast) mode.go(mode.index + 1);
      else if (key === 'p' && mode.index > 0) mode.go(mode.index - 1);
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mode, isLast]);

  const cue = findActiveCue(cues, player.currentMs);

  return (
    <main className="page">
      <Link className="back-link" to={mode ? `/vietsub/list?playlist=${mode.playlist.id}` : '/vietsub/list'}>
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
          This video has no Vietsub yet.{!readOnly && <> <Link to="/vietsub">Add Vietsub</Link></>}
        </p>
      )}

      {/* The player keeps its place in the tree when switching videos, so page fullscreen stays on. */}
      <div className={mode ? 'watch watch--playlist' : 'watch'}>
        {!error && <VideoPlayer containerRef={playerRef} cue={cue} error={player.error} />}
        {mode && (
          <PlaylistPanel
            playlist={mode.playlist}
            index={mode.index}
            autoplay={mode.autoplay}
            ended={ended && isLast}
            onAutoplayChange={mode.setAutoplay}
            onPrevious={() => mode.go(mode.index - 1)}
            onNext={() => mode.go(mode.index + 1)}
          />
        )}
      </div>
    </main>
  );
}
