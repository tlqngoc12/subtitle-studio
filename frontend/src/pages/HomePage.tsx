import { toast } from 'sonner';
import { useConfirmDialog } from '../components/useConfirmDialog';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteVideo,
  fetchVideo,
  getCues,
  getPromptProfiles,
  listVideos,
  translateVideo,
  type CueDto,
  type PromptProfiles,
  type SkipReason,
  type VideoDto,
} from '../api/client';
import { Pagination } from '../components/Pagination';
import { ResultPanel } from '../components/ResultPanel';
import { UrlForm } from '../components/UrlForm';
import { VideoList } from '../components/VideoList';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import { usePagination } from '../lib/usePagination';
import { useTranslationPolling } from '../lib/useTranslationPolling';
import { Alert } from '../components/ui/Alert';
import { Page } from '../components/ui/Page';
import { PageHeader } from '../components/ui/PageHeader';

interface Current {
  video: VideoDto;
  cues: CueDto[] | null;
}

const PROFILE_KEY = 'subtitle-studio.profile';

/** The last chosen translation profile ('' = no translation); storage may be unavailable. */
function readStoredProfile(): string {
  try {
    return localStorage.getItem(PROFILE_KEY) ?? '';
  } catch {
    return '';
  }
}

/** Puts `video` first, replacing any older entry with the same id. */
function upsert(list: VideoDto[] | null, video: VideoDto): VideoDto[] {
  return [video, ...(list ?? []).filter((v) => v.id !== video.id)];
}

export default function HomePage() {
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [videos, setVideos] = useState<VideoDto[] | null>(null);
  const [current, setCurrent] = useState<Current | null>(null);
  const [pending, setPending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const pager = usePagination(videos);
  const [profiles, setProfiles] = useState<PromptProfiles>({ configured: false, profiles: [] });
  const [profile, setProfile] = useState(readStoredProfile);
  const [skipReason, setSkipReason] = useState<SkipReason | null>(null);
  const resultRef = useRef<HTMLElement>(null);
  /** Bumped when a video is opened from the list; the panel then scrolls into view. */
  const [scrollRequest, setScrollRequest] = useState(0);

  useEffect(() => {
    const panel = resultRef.current;
    if (scrollRequest === 0 || !panel) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    panel.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    // Move focus with the view so keyboard and screen-reader users land on the opened video.
    panel.querySelector<HTMLElement>('.result__title')?.focus({ preventScroll: true });
  }, [scrollRequest]);

  /** Replaces a video everywhere it is shown (list and result panel). */
  const replaceVideo = useCallback((video: VideoDto) => {
    setVideos((list) => (list ?? []).map((v) => (v.id === video.id ? video : v)));
    setCurrent((c) => (c?.video.id === video.id ? { ...c, video } : c));
  }, []);

  const forgetVideo = useCallback((id: string) => {
    setVideos((list) => (list ?? []).filter((v) => v.id !== id));
    setCurrent((c) => (c?.video.id === id ? null : c));
  }, []);

  const translatingIds = [
    ...(videos ?? []).filter((v) => v.translationStatus === 'TRANSLATING').map((v) => v.id),
    ...(current?.video.translationStatus === 'TRANSLATING' ? [current.video.id] : []),
  ];
  useTranslationPolling(translatingIds, replaceVideo, forgetVideo);

  useEffect(() => {
    getPromptProfiles()
      .then((p) => {
        setProfiles(p);
        setProfile((chosen) => (p.profiles.includes(chosen) ? chosen : ''));
      })
      .catch(() => {
        // Without the list the dropdown stays disabled; Get Engsub still works.
      });
  }, []);

  function chooseProfile(next: string) {
    setProfile(next);
    try {
      localStorage.setItem(PROFILE_KEY, next);
    } catch {
      // not remembered; fine
    }
  }

  useEffect(() => {
    listVideos()
      .then(setVideos)
      .catch((e) => {
        setVideos([]);
        setError(errorMessage(e));
      });
  }, []);

  const show = useCallback(async (video: VideoDto) => {
    setCurrent({ video, cues: null });
    try {
      const cues = await getCues(video.id);
      setCurrent((c) => (c?.video.id === video.id ? { video, cues } : c));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  /** Get Engsub; returns whether it worked so the link field can be cleared. */
  async function handleFetch(url: string): Promise<boolean> {
    setPending(true);
    setError(null);
    try {
      const { video, created, skipReason: skipped } = await fetchVideo(url, profiles.configured && profile ? profile : undefined);
      if (!created) toast.warning('Already fetched', { description: video.title }); // the stored copy is shown, YouTube was not called
      setSkipReason(skipped);
      setVideos((list) => upsert(list, video));
      setHighlightId(video.id);
      pager.setPage(1, { replace: true }); // the fetched video is now first in the list
      await show(video);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setPending(false);
    }
  }

  async function handleTranslate(video: VideoDto) {
    if (
      video.viSource === 'AUTO' &&
      !(await confirm({
        title: 'Replace the Gemini Vietsub?',
        description: 'The current AI Vietsub is replaced by a new translation.',
        confirmLabel: 'Replace',
      }))
    ) {
      return;
    }
    setError(null);
    try {
      replaceVideo(await translateVideo(video.id, profile));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function handleDelete(video: VideoDto) {
    const ok = await confirm({
      title: `Delete "${video.title}"?`,
      description: 'Its English subtitles, Vietsub and saved subtitle files are deleted too.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setBusyId(video.id);
    setError(null);
    try {
      await deleteVideo(video.id);
      setVideos((list) => (list ?? []).filter((v) => v.id !== video.id));
      setCurrent((c) => (c?.video.id === video.id ? null : c));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Page>
      {confirmDialog}
      <PageHeader
        title="Get Engsub"
        lede="Paste a YouTube link to get cleaned-up English subtitles, then download the .srt file to translate."
      />

      <UrlForm
        pending={pending}
        onSubmit={handleFetch}
        profiles={profiles.profiles}
        configured={profiles.configured}
        profile={profile}
        onProfileChange={chooseProfile}
      />

      {error && (
        <Alert title={error.title} hint={error.hint} />
      )}

      {current && (
        <ResultPanel
          video={current.video}
          cues={current.cues}
          profile={profile}
          skipReason={skipReason}
          onTranslate={handleTranslate}
          ref={resultRef}
        />
      )}

      <VideoList
        videos={pager.items}
        footer={<Pagination page={pager.page} pageCount={pager.pageCount} onChange={pager.setPage} />}
        busyId={busyId}
        highlightId={highlightId}
        listKey={pager.page}
        onOpen={(v) => {
          setError(null);
          setSkipReason(null); // only describes the video just fetched
          void show(v);
          setScrollRequest((n) => n + 1); // scroll up to the cue timeline
        }}
        onDelete={handleDelete}
      />
    </Page>
  );
}
