import { FileUp, Languages } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError, getVideo, getVietsub, type ViCue, type VideoDto } from '../api/client';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { VideoPlayer } from '../components/VideoPlayer';
import { CueEditorTable } from '../components/vietsub/CueEditorTable';
import { Alert } from '../components/ui/Alert';
import { LoadingText } from '../components/ui/LoadingText';
import { PageHeader } from '../components/ui/PageHeader';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import { findActiveIndex } from '../lib/findActiveCue';
import { useTranslationPolling } from '../lib/useTranslationPolling';
import { useYouTubePlayer } from '../player/useYouTubePlayer';
import './VietsubEditPage.css';

/**
 * Admin editor for the Vietsub text of one video: the YouTube video on the left with the line on screen (your
 * unsaved edit included), the lines in a table on the right. Timing is read-only.
 *
 * This component loads the video and its lines and handles the states without an editor (loading, not found,
 * no Vietsub, translating). `Editor` is mounted only when there are lines, so its player container always exists.
 */
export default function VietsubEditPage() {
  const { id = '' } = useParams();
  const [video, setVideo] = useState<VideoDto | null>(null);
  /** The lines as loaded: timing, and the text the edits are compared with. */
  const [cues, setCues] = useState<ViCue[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // The video first, then its lines: if the Vietsub changes in between, the lines are newer than the
  // `viUpdatedAt` kept for saving, so a save is refused (409) instead of overwriting the newer version.
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setNotFound(false);
    setError(null);
    getVideo(id)
      .then(async (v) => {
        const lines = v.viCueCount > 0 ? await getVietsub(id) : [];
        if (cancelled) return;
        setVideo(v);
        setCues(lines);
        setLoaded(true);
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404 && e.code === 'VIDEO_NOT_FOUND') setNotFound(true);
        else setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  const translating = video?.translationStatus === 'TRANSLATING';

  // While Gemini translates this video, wait for it; the new Vietsub is loaded when it is done.
  useTranslationPolling(
    translating ? [id] : [],
    (v) => {
      if (v.translationStatus !== 'TRANSLATING') setReloadKey((k) => k + 1);
    },
    () => setNotFound(true),
  );

  if (notFound) {
    return (
      <main className="page vedit">
        <Alert title="This video is no longer in the list.">
          <Link to="/vietsub">Back to Manage Vietsub</Link>
        </Alert>
      </main>
    );
  }
  if (error) {
    return (
      <main className="page vedit">
        <Alert title={error.title} hint={error.hint} />
      </main>
    );
  }
  if (!loaded || !video) {
    return (
      <main className="page vedit">
        <LoadingText>Loading Vietsub…</LoadingText>
      </main>
    );
  }

  if (cues.length === 0) {
    return (
      <main className="page vedit">
        <div>
          <Breadcrumbs items={crumbs(video)} />
          <PageHeader title={video.title} />
        </div>
        {translating ? (
          <p className="muted" role="status">
            Gemini is translating this video. Editing is available when it finishes.
          </p>
        ) : (
          <Alert title="This video has no Vietsub yet." />
        )}
      </main>
    );
  }

  return <Editor key={`${id}:${reloadKey}`} video={video} cues={cues} translating={translating} />;
}

function crumbs(video: VideoDto) {
  return [
    { label: 'Vietsub', to: '/vietsub/list' },
    { label: 'Manage Vietsub', to: '/vietsub' },
    { label: video.title },
  ];
}

function SourceBadge({ source }: { source: VideoDto['viSource'] }) {
  return source === 'AUTO' ? (
    <span className="badge badge--info">
      <Languages className="icon icon--sm" aria-hidden="true" />
      AI
    </span>
  ) : (
    <span className="badge badge--done">
      <FileUp className="icon icon--sm" aria-hidden="true" />
      Manual
    </span>
  );
}

/** The header, the player and the table of a video that has lines. */
function Editor({ video, cues, translating }: { video: VideoDto; cues: ViCue[]; translating: boolean }) {
  const [texts, setTexts] = useState<string[]>(() => cues.map((c) => c.text));
  const playerRef = useRef<HTMLDivElement>(null);
  const player = useYouTubePlayer(playerRef, video.id);
  const { seekTo } = player;

  const onChange = useCallback((index: number, text: string) => {
    setTexts((prev) => {
      if (prev[index] === text) return prev;
      const next = prev.slice();
      next[index] = text;
      return next;
    });
  }, []);

  const activeIndex = useMemo(() => findActiveIndex(cues, player.currentMs), [cues, player.currentMs]);
  const activeText = activeIndex >= 0 ? texts[activeIndex] : null;
  const overlayCue = useMemo<ViCue | null>(
    () => (activeIndex >= 0 && activeText !== null ? { ...cues[activeIndex], text: activeText } : null),
    [cues, activeIndex, activeText],
  );

  return (
    <main className="page vedit">
      <div>
        <Breadcrumbs items={crumbs(video)} />
        <PageHeader title={video.title} actions={<SourceBadge source={video.viSource} />} />
      </div>

      {translating && (
        <p className="muted" role="status">
          Gemini is translating this video. Editing is available when it finishes.
        </p>
      )}

      <div className="vedit__body">
        <div className="vedit__player">
          <VideoPlayer containerRef={playerRef} cue={overlayCue} error={player.error} />
        </div>
        <CueEditorTable
          cues={cues}
          texts={texts}
          activeIndex={activeIndex}
          readOnly={translating}
          onChange={onChange}
          onSeek={seekTo}
        />
      </div>
    </main>
  );
}
