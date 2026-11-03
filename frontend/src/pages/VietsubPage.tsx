import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { addVietsub, deleteVietsub, listVideos, type VideoDto } from '../api/client';
import { Pagination } from '../components/Pagination';
import { VietsubForm } from '../components/VietsubForm';
import { VietsubList } from '../components/VietsubList';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import { usePagination } from '../lib/usePagination';
import { withVietsub } from '../lib/vietsub';

export default function VietsubPage() {
  const navigate = useNavigate();
  const [videos, setVideos] = useState<VideoDto[] | null>(null);
  const [pending, setPending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const pager = usePagination(videos);

  useEffect(() => {
    listVideos()
      .then((all) => setVideos(withVietsub(all)))
      .catch((e) => {
        setVideos([]);
        setError(errorMessage(e));
      });
  }, []);

  async function handleAdd(url: string, file: File) {
    setPending(true);
    setError(null);
    try {
      const video = await addVietsub(url, file);
      navigate(`/vietsub/${video.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setPending(false);
    }
  }

  async function handleReplace(video: VideoDto, file: File) {
    setBusyId(video.id);
    setError(null);
    try {
      const updated = await addVietsub(video.id, file);
      setVideos((list) => withVietsub([updated, ...(list ?? []).filter((v) => v.id !== updated.id)]));
      setHighlightId(updated.id);
      pager.setPage(1, { replace: true }); // the replaced video is now the most recent one
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(video: VideoDto) {
    if (!window.confirm(`Delete the Vietsub of "${video.title}"?`)) return;
    setBusyId(video.id);
    setError(null);
    try {
      await deleteVietsub(video.id);
      setVideos((list) => (list ?? []).filter((v) => v.id !== video.id));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="page">
      <header className="masthead">
        <h1 className="masthead__name">Vietsub</h1>
        <p className="masthead__lede">
          Paste a YouTube link and choose a Vietnamese .srt file (with the original timing) to watch the video with Vietsub.
        </p>
      </header>

      <VietsubForm pending={pending} onSubmit={handleAdd} />

      {error && (
        <div className="alert" role="alert">
          <p className="alert__title">{error.title}</p>
          {error.hint && <p className="alert__hint">{error.hint}</p>}
        </div>
      )}

      <VietsubList
        videos={pager.items}
        busyId={busyId}
        highlightId={highlightId}
        listKey={pager.page}
        onReplace={handleReplace}
        onDelete={handleDelete}
        footer={<Pagination page={pager.page} pageCount={pager.pageCount} onChange={pager.setPage} />}
      />
    </main>
  );
}
