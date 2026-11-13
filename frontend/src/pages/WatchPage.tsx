import { ArrowLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import type { ViCue } from '../api/client';
import { useSite } from '../data/SiteContext';
import { countsAsWatched, markWatched } from '../data/watched';
import type { PublicVideo } from '../data/types';
import { PlaylistPanel } from '../components/PlaylistPanel';
import { ShortcutsHelp } from '../components/ShortcutsHelp';
import { VideoPlayer } from '../components/VideoPlayer';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import { findActiveCue } from '../lib/findActiveCue';
import { isTyping } from '../lib/keyboard';
import { useCaptionsPref } from '../lib/useCaptionsPref';
import { useCaptionSize, useTheater } from '../lib/viewerPrefs';
import { usePlayerShortcuts } from '../lib/usePlayerShortcuts';
import { usePlaylistMode } from '../lib/usePlaylistMode';
import { useYouTubePlayer } from '../player/useYouTubePlayer';
import { Alert } from '../components/ui/Alert';
import { PageHeader } from '../components/ui/PageHeader';
import './WatchPage.css';
import { useT } from '../lib/i18n';

/**
 * The end result of the workflow: the YouTube video playing with its Vietsub. With `?playlist=` it also shows
 * the playlist panel, plays the next video when one ends (Autoplay) and answers Shift+N / Shift+P.
 * Also answers the player keys (K/Space, J/L, arrows, M, C, ?), can hide the Vietsub, and remembers which
 * videos were watched (ended, or past 90%) so lists can show it.
 */
export default function WatchPage() {
  const { id = '' } = useParams();
  const { source, readOnly } = useSite();
  const t = useT();
  const [video, setVideo] = useState<PublicVideo | null>(null);
  const [cues, setCues] = useState<ViCue[]>([]);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const startPlaying = (location.state as { autoplay?: boolean } | null)?.autoplay === true;
  const player = useYouTubePlayer(playerRef, id, { autoplay: startPlaying });
  const mode = usePlaylistMode(id);
  const [captionsOn, toggleCaptions] = useCaptionsPref();
  const [helpOpen, setHelpOpen] = useState(false);
  const [theater, toggleTheater] = useTheater();
  const [captionSize] = useCaptionSize();
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

  // Watched: the video ended, or played past 90% of its length. Works the same on the public site.
  const durationSec = video?.id === id ? video.durationSec : null;
  const watched = countsAsWatched({ ended, currentMs: player.currentMs, durationSec });
  useEffect(() => {
    if (watched) markWatched(id);
  }, [watched, id]);

  usePlayerShortcuts({
    togglePlay: player.togglePlay,
    seekBy: player.seekBy,
    toggleMute: player.toggleMute,
    toggleCaptions,
    toggleHelp: () => setHelpOpen((open) => !open),
    toggleTheater,
  });

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
        <ArrowLeft className="icon icon--sm" aria-hidden="true" />
        {t('Back to Vietsub list', 'Quay lại danh sách Vietsub')}
      </Link>

      {error && (
        <Alert title={error.title} hint={error.hint} />
      )}

      {/* The player keeps its place in the tree when switching videos, so page fullscreen stays on. */}
      <div className={['watch', mode && 'watch--playlist', theater && 'watch--theater'].filter(Boolean).join(' ')}>
        <div className="watch__main">
          {!error && (
            <VideoPlayer
              containerRef={playerRef}
              cue={cue}
              error={player.error}
              onRefreshSize={player.refreshSize}
              captionsOn={captionsOn}
              onToggleCaptions={toggleCaptions}
              captionSize={captionSize}
              theater={theater}
              onToggleTheater={toggleTheater}
            />
          )}

          {video && (
            <PageHeader
              className="masthead--watch"
              title={video.title}
              lede={video.channel}
              actions={<ShortcutsHelp open={helpOpen} onOpenChange={setHelpOpen} playlist={mode !== null} />}
            />
          )}

          {video && video.viCueCount === 0 && (
            <p className="muted">
              {t('This video has no Vietsub yet.', 'Video này chưa có Vietsub.')}
            </p>
          )}
        </div>
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
