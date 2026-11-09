import { FileUp, Languages, Save } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ApiError, getVideo, getVietsub, saveVietsubText, type ViCue, type VideoDto } from '../api/client';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { useConfirmDialog } from '../components/useConfirmDialog';
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

  return (
    <Editor
      key={`${id}:${reloadKey}`}
      video={video}
      cues={cues}
      translating={translating}
      onReload={() => setReloadKey((k) => k + 1)}
    />
  );
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

const MAX_TEXT = 1000;

/** What the server stores for a typed line: CRLF as LF, NFC, trimmed. Used to compare and to reset the dirty state. */
function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, '\n').normalize('NFC').trim();
}

/** The header, the player and the table of a video that has lines. */
function Editor({
  video: initialVideo,
  cues,
  translating,
  onReload,
}: {
  video: VideoDto;
  cues: ViCue[];
  translating: boolean;
  onReload: () => void;
}) {
  const navigate = useNavigate();
  const { confirm, dialog } = useConfirmDialog();
  const [video, setVideo] = useState(initialVideo);
  /** The text last loaded or saved, line by line: the edits are compared with it. */
  const [saved, setSaved] = useState<string[]>(() => cues.map((c) => c.text));
  const [texts, setTexts] = useState<string[]>(() => cues.map((c) => c.text));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ message: ErrorMessage; reload: boolean } | null>(null);
  const [lineErrors, setLineErrors] = useState<Record<number, string>>({});
  const playerRef = useRef<HTMLDivElement>(null);
  const player = useYouTubePlayer(playerRef, video.id);
  const { seekTo } = player;

  /** The table compares with the saved text, and keeps the timing of the loaded lines. */
  const baseline = useMemo(() => cues.map((c, i) => ({ ...c, text: saved[i] })), [cues, saved]);

  const onChange = useCallback((index: number, text: string) => {
    setTexts((prev) => {
      if (prev[index] === text) return prev;
      const next = prev.slice();
      next[index] = text;
      return next;
    });
    // Typing in a rejected line clears its message.
    setLineErrors((prev) => {
      if (!(index in prev)) return prev;
      const { [index]: _gone, ...rest } = prev;
      return rest;
    });
  }, []);

  const dirty = useMemo(() => texts.some((t, i) => t !== saved[i]), [texts, saved]);
  const valid = useMemo(
    () => texts.every((t) => normalizeText(t).length > 0 && normalizeText(t).length <= MAX_TEXT),
    [texts],
  );
  const canSave = dirty && valid && !translating && !saving;

  const save = useCallback(async () => {
    const sent = texts.map(normalizeText);
    setSaving(true);
    setSaveError(null);
    setLineErrors({});
    try {
      const updated = await saveVietsubText(video.id, video.viUpdatedAt, sent);
      setVideo(updated);
      setSaved(sent);
      // What was typed meanwhile stays; lines still equal to what was sent show the stored (trimmed) form.
      setTexts((current) => current.map((t, i) => (normalizeText(t) === sent[i] ? sent[i] : t)));
      toast.success('Vietsub saved');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'INVALID_VIETSUB_TEXT' && e.fieldErrors.length > 0) {
        const byLine: Record<number, string> = {};
        for (const f of e.fieldErrors) {
          const m = /^lines\[(\d+)\]\.text$/.exec(f.field);
          if (m && !(Number(m[1]) in byLine)) byLine[Number(m[1])] = f.message;
        }
        setLineErrors(byLine);
        setSaveError({ message: errorMessage(e), reload: false });
      } else {
        setSaveError({ message: errorMessage(e), reload: e instanceof ApiError && e.status === 409 });
      }
    } finally {
      setSaving(false);
    }
  }, [texts, video.id, video.viUpdatedAt]);

  // Ctrl+S / ⌘S saves instead of opening the browser's "save page" dialog.
  const saveRef = useRef(save);
  saveRef.current = save;
  const canSaveRef = useRef(canSave);
  canSaveRef.current = canSave;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      if (canSaveRef.current) void saveRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Unsaved edits: the browser asks before the tab closes or reloads...
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // ...and the app asks before an in-app link (menu, breadcrumb) leaves the page. The router in use has no
  // navigation blocker, so clicks on links are caught before React Router sees them.
  useEffect(() => {
    if (!dirty) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!link || (link.getAttribute('target') ?? '_self') !== '_self' || link.hasAttribute('download')) return;
      const url = new URL(link.getAttribute('href') ?? '', window.location.href);
      if (url.origin !== window.location.origin) return;
      e.preventDefault();
      e.stopPropagation();
      void confirm({
        title: 'Discard unsaved changes?',
        description: 'Your edits to this Vietsub have not been saved.',
        confirmLabel: 'Leave',
        destructive: true,
      }).then((ok) => {
        if (ok) navigate(url.pathname + url.search + url.hash);
      });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [dirty, confirm, navigate]);

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
        <PageHeader
          title={video.title}
          actions={
            <div className="vedit__actions">
              <SourceBadge source={video.viSource} />
              {dirty && <span className="muted">Unsaved changes</span>}
              <button className="button button--primary" type="button" disabled={!canSave} onClick={() => void save()}>
                <Save className="icon icon--sm" aria-hidden="true" />
                Save
              </button>
            </div>
          }
        />
        {!valid && <p className="muted vedit__hint">Every line needs text (1000 characters at most) before you can save.</p>}
      </div>

      {translating && (
        <p className="muted" role="status">
          Gemini is translating this video. Editing is available when it finishes.
        </p>
      )}

      {saveError && (
        <Alert title={saveError.message.title} hint={saveError.message.hint}>
          {saveError.reload && (
            <button className="button button--small" type="button" onClick={onReload}>
              Reload
            </button>
          )}
        </Alert>
      )}

      <div className="vedit__body">
        <div className="vedit__player">
          <VideoPlayer containerRef={playerRef} cue={overlayCue} error={player.error} />
        </div>
        <CueEditorTable
          cues={baseline}
          texts={texts}
          activeIndex={activeIndex}
          readOnly={translating}
          errors={lineErrors}
          onChange={onChange}
          onSeek={seekTo}
        />
      </div>
      {dialog}
    </main>
  );
}
