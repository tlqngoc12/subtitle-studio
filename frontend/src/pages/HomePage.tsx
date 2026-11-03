import { useCallback, useEffect, useState } from 'react';
import {
  deleteVideo,
  fetchVideo,
  getCues,
  getPromptProfiles,
  listVideos,
  refreshVideo,
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

  async function handleFetch(url: string) {
    setPending(true);
    setError(null);
    try {
      const { video, skipReason: skipped } = await fetchVideo(url, profiles.configured && profile ? profile : undefined);
      setSkipReason(skipped);
      setVideos((list) => upsert(list, video));
      setHighlightId(video.id);
      pager.setPage(1, { replace: true }); // the fetched video is now first in the list
      await show(video);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  async function handleTranslate(video: VideoDto) {
    if (video.viSource === 'AUTO' && !window.confirm('Replace the Gemini Vietsub?')) return;
    setError(null);
    try {
      replaceVideo(await translateVideo(video.id, profile));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function handleRefresh(video: VideoDto) {
    setBusyId(video.id);
    setError(null);
    try {
      const updated = await refreshVideo(video.id);
      setVideos((list) => (list ?? []).map((v) => (v.id === updated.id ? updated : v)));
      if (current?.video.id === updated.id) await show(updated);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(video: VideoDto) {
    if (!window.confirm(`Delete "${video.title}" and its saved subtitles?`)) return;
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
    <main className="page">
      <header className="masthead">
        <h1 className="masthead__name">Subtitle Studio</h1>
        <p className="masthead__lede">Paste a YouTube link to get cleaned-up English subtitles, then download the .srt file to translate.</p>
      </header>

      <UrlForm
        pending={pending}
        onSubmit={handleFetch}
        profiles={profiles.profiles}
        configured={profiles.configured}
        profile={profile}
        onProfileChange={chooseProfile}
      />

      {error && (
        <div className="alert" role="alert">
          <p className="alert__title">{error.title}</p>
          {error.hint && <p className="alert__hint">{error.hint}</p>}
        </div>
      )}

      {current && (
        <ResultPanel
          video={current.video}
          cues={current.cues}
          profile={profile}
          skipReason={skipReason}
          onTranslate={handleTranslate}
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
        }}
        onRefresh={handleRefresh}
        onDelete={handleDelete}
      />
    </main>
  );
}
