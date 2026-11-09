import { useConfirmDialog } from '../components/useConfirmDialog';
import { toast } from 'sonner';
import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { deleteVietsub, replaceVietsub, listVideos, type VideoDto } from '../api/client';
import { Pagination } from '../components/Pagination';
import { SourceFilter } from '../components/SourceFilter';
import { VietsubList } from '../components/VietsubList';
import { VietsubTabs } from '../components/VietsubTabs';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import { matchesSearch } from '../lib/search';
import { usePagination } from '../lib/usePagination';
import { withVietsub } from '../lib/vietsub';

export default function VietsubPage() {
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [videos, setVideos] = useState<VideoDto[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const sourceParam = params.get('source');
  const source: 'ai' | 'manual' | null = sourceParam === 'ai' || sourceParam === 'manual' ? sourceParam : null;
  const filtered = useMemo(
    () =>
      videos === null
        ? null
        : videos.filter(
            (v) =>
              (source === null || (source === 'ai') === (v.viSource === 'AUTO')) && matchesSearch(v, query),
          ),
    [videos, query, source],
  );
  const pager = usePagination(filtered);

  /** Changing the search or the filter starts again on page 1. */
  function setFilter(key: 'q' | 'source', value: string | null) {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete('page');
        if (value) p.set(key, value);
        else p.delete(key);
        return p;
      },
      { replace: true },
    );
  }

  useEffect(() => {
    listVideos()
      .then((all) => setVideos(withVietsub(all)))
      .catch((e) => {
        setVideos([]);
        setError(errorMessage(e));
      });
  }, []);

  async function handleReplace(video: VideoDto, file: File) {
    setBusyId(video.id);
    setError(null);
    try {
      const updated = await replaceVietsub(video.id, file);
      setVideos((list) => withVietsub([updated, ...(list ?? []).filter((v) => v.id !== updated.id)]));
      setHighlightId(updated.id);
      pager.setPage(1, { replace: true }); // the replaced video is now the most recent one
      toast.success(`Vietsub replaced: ${updated.title} (${updated.viCueCount} lines)`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(video: VideoDto) {
    const ok = await confirm({
      title: `Delete the Vietsub of "${video.title}"?`,
      description: 'The video and its English subtitles stay.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
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
      {confirmDialog}
      <header className="masthead">
        <h1 className="masthead__name">Vietsub</h1>
        <p className="masthead__lede">Replace, download or delete the Vietsub of your videos.</p>
      </header>
      <VietsubTabs />

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
        filtered={query.trim() !== '' || source !== null}
        toolbar={
          <div className="toolbar">
            <div className="searchbar">
              <Search className="icon searchbar__icon" aria-hidden="true" />
              <input
                type="search"
                className="searchbar__input"
                placeholder="Search videos"
                aria-label="Search videos"
                value={query}
                onChange={(e) => setFilter('q', e.target.value)}
              />
              {query && (
                <button className="button button--icon searchbar__clear" type="button" aria-label="Clear search" onClick={() => setFilter('q', null)}>
                  <X className="icon" aria-hidden="true" />
                </button>
              )}
            </div>
            <SourceFilter value={source} onChange={(v) => setFilter('source', v)} />
          </div>
        }
        onReplace={handleReplace}
        onDelete={handleDelete}
        footer={<Pagination page={pager.page} pageCount={pager.pageCount} onChange={pager.setPage} />}
      />
    </main>
  );
}
