import { useCallback, useEffect, useState } from 'react';
import {
  deleteVideo,
  fetchVideo,
  getCues,
  getPromptProfiles,
  listVideos,
  refreshVideo,
  type CueDto,
  type PromptProfiles,
  type VideoDto,
} from '../api/client';
import { Pagination } from '../components/Pagination';
import { ResultPanel } from '../components/ResultPanel';
import { UrlForm } from '../components/UrlForm';
import { VideoList } from '../components/VideoList';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import { usePagination } from '../lib/usePagination';

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
  const pager = usePagination(videos);
  const [profiles, setProfiles] = useState<PromptProfiles>({ configured: false, profiles: [] });
  const [profile, setProfile] = useState(readStoredProfile);

  useEffect(() => {
    getPromptProfiles()
      .then((p) => {
        setProfiles(p);
        setProfile((chosen) => (p.profiles.includes(chosen) ? chosen : ''));
      })
      .catch(() => {
        // Without the list the dropdown stays disabled; Lấy Engsub still works.
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
      const { video } = await fetchVideo(url, profiles.configured && profile ? profile : undefined);
      setVideos((list) => upsert(list, video));
      pager.setPage(1, { replace: true }); // the fetched video is now first in the list
      await show(video);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
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
    if (!window.confirm(`Xoá "${video.title}" cùng phụ đề đã lưu?`)) return;
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
        <p className="masthead__lede">Dán link YouTube để lấy phụ đề tiếng Anh đã làm sạch, rồi tải về file .srt để dịch.</p>
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

      {current && <ResultPanel video={current.video} cues={current.cues} />}

      <VideoList
        videos={pager.items}
        footer={<Pagination page={pager.page} pageCount={pager.pageCount} onChange={pager.setPage} />}
        busyId={busyId}
        onOpen={(v) => {
          setError(null);
          void show(v);
        }}
        onRefresh={handleRefresh}
        onDelete={handleDelete}
      />
    </main>
  );
}
