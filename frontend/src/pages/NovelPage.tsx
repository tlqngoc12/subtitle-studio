import * as Tabs from '@radix-ui/react-tabs';
import { TabTrigger } from '../components/ui/TabTrigger';
import { CloudDownload, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import {
  addChapter,
  deleteNovel,
  fetchTranslateNext,
  getNovel,
  reorderChapters,
  updateNovel,
  type ChapterSummary,
  type NotebookView as NotebookData,
  type NovelDetail,
} from '../api/novels';
import { ChapterList } from '../components/novel/ChapterList';
import { NotebookView } from '../components/novel/NotebookView';
import { NovelForm } from '../components/novel/NovelForm';
import { NovelProfileTab } from '../components/novel/NovelProfileTab';
import { WattpadParts, novelIsBusy } from '../components/novel/WattpadParts';
import { useNovelPolling } from '../lib/useNovelPolling';
import { busyTitle, novelBusy } from '../lib/novelBusy';
import { BusyLine } from '../components/novel/BusyLine';
import { Tip } from '../components/Tip';
import { useConfirmDialog } from '../components/useConfirmDialog';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import { toastError, toastSkippedImages } from '../lib/toast';
import { STATUS_LABEL } from './NovelsPage';
import { Alert } from '../components/ui/Alert';
import { Page } from '../components/ui/Page';
import { PageHeader } from '../components/ui/PageHeader';
import { PageSkeleton } from '../components/ui/Skeleton';
import { Toolbar } from '../components/ui/Toolbar';
import { Cover } from '../components/ui/Cover';

/** The highest Published chapter number, or null when none is published. */
function latestPublishedNo(chapters: NovelDetail['chapters']): number | null {
  const numbers = chapters.filter((c) => c.publishStatus === 'PUBLISHED').map((c) => c.chapterNo);
  return numbers.length > 0 ? Math.max(...numbers) : null;
}

/** Novels › one novel: Chapters | Details | Notebook | Profile. The novel is loaded once for every tab. */
export default function NovelPage() {
  const { id } = useParams();
  const novelId = Number(id);
  const navigate = useNavigate();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [novel, setNovel] = useState<NovelDetail | null>(null);
  const [notebook, setNotebook] = useState<NotebookData | null>(null);
  const [search] = useSearchParams();
  const [tab, setTab] = useState(() => {
    const wanted = search.get('tab');
    return wanted === 'wattpad' || wanted === 'profile' ? wanted : 'chapters';
  });
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    getNovel(novelId)
      .then(setNovel)
      .catch((e) => setError(errorMessage(e)));
  }, [novelId]);

  /** Reloads the novel (its chapter list) after parts were imported. */
  const reloadNovel = useCallback(() => {
    return getNovel(novelId)
      .then(setNovel)
      .catch((e) => setError(errorMessage(e)));
  }, [novelId]);

  // Poll the novel (never Wattpad) while a chapter translates or the notebook updates.
  useNovelPolling(novelId, novel !== null && novelIsBusy(novel), setNovel);

  // The header badge follows the switch: keep the novel's flag in step with the notebook view.
  const onNotebook = useCallback((v: NotebookData) => {
    setNotebook(v);
    setNovel((n) => (n && n.notebookPaused !== v.notebookPaused ? { ...n, notebookPaused: v.notebookPaused } : n));
  }, []);

  const busy = novel ? novelBusy(novel) : null;

  async function add() {
    setAdding(true);
    setError(null);
    try {
      const created = await addChapter(novelId, {});
      navigate(`/novels/${novelId}/chapters/${created.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setAdding(false);
    }
  }

  /** Starts the next Wattpad part (fetching it if needed) and opens its chapter, which polls while it translates. */
  async function startNext() {
    setAdding(true);
    try {
      const started = await fetchTranslateNext(novelId);
      toast.info('Translation started', { description: started.title ?? undefined });
      toastSkippedImages(started.skippedImages);
      navigate(`/novels/${novelId}/chapters/${started.id}`);
    } catch (e) {
      toastError(errorMessage(e));
      setAdding(false);
    }
  }

  /** Optimistic: shows the new order at once, goes back to the old one when the server refuses it. */
  async function reorder(next: ChapterSummary[]) {
    if (!novel) return;
    const previous = novel.chapters;
    setError(null);
    setNovel({ ...novel, chapters: next });
    try {
      const saved = await reorderChapters(novelId, next.map((c) => c.id));
      setNovel((n) => (n ? { ...n, chapters: saved } : n));
    } catch (e) {
      setError(errorMessage(e));
      setNovel((n) => (n ? { ...n, chapters: previous } : n));
    }
  }

  async function remove() {
    if (!novel) return;
    const ok = await confirm({
      title: `Delete the novel "${novel.title}"?`,
      description: 'Every chapter, screenshot, translation and the notebook are deleted. This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteNovel(novelId);
      navigate('/novels');
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Page>
      {confirmDialog}
      {error && !novel && (
        <PageHeader breadcrumbs={[{ label: 'Novels', to: '/novels' }, { label: 'Novel' }]} title="Novel" />
      )}
      {error && <Alert title={error.title} hint={error.hint} />}
      {!novel ? (
        !error && <PageSkeleton rows={4} />
      ) : (
        <>
          <PageHeader
            variant="hero"
            breadcrumbs={[{ label: 'Novels', to: '/novels' }, { label: novel.title }]}
            title={novel.title}
            media={<Cover src={novel.coverUrl} />}
            meta={
              <>
                <span className="badge badge--info">{STATUS_LABEL[novel.novelStatus]}</span>
                {novel.notebookPaused && <span className="badge badge--info">Notebook paused</span>}
              </>
            }
          />

          {busy && <BusyLine busy={busy} />}

          <Tabs.Root value={tab} onValueChange={setTab} className="tabs">
            <Tabs.List className="tabs__list" aria-label="Novel sections">
              <TabTrigger className="tabs__tab" value="chapters">
                Chapters
              </TabTrigger>
              {novel.sourceType === 'WATTPAD' && (
                <TabTrigger className="tabs__tab" value="wattpad">
                  Wattpad
                </TabTrigger>
              )}
              <TabTrigger className="tabs__tab" value="details">
                Details
              </TabTrigger>
              <TabTrigger className="tabs__tab" value="notebook">
                Notebook
              </TabTrigger>
              <TabTrigger className="tabs__tab" value="profile">
                Profile
              </TabTrigger>
            </Tabs.List>

            <Tabs.Content value="chapters" className="tabs__panel">
              <Toolbar
                className="toolbar--above-list"
                actions={
                  novel.sourceType === 'WATTPAD' ? (
                    // Wattpad chapters come from Wattpad: screenshot chapters would mix the two sources.
                    // The reason shows before the click: a disabled button swallows hover, so the tip sits on a span.
                    <Tip label={busy ? busyTitle(busy) : ''} disabled={!busy}>
                      <span className="novel-busy__tip">
                        <button className="button button--primary" type="button" onClick={() => void startNext()}
                          disabled={adding || busy !== null}>
                          <CloudDownload className="icon" aria-hidden="true" />
                          {adding ? 'Starting…' : 'Fetch & translate next'}
                        </button>
                      </span>
                    </Tip>
                  ) : (
                    <button className="button button--primary" type="button" onClick={add} disabled={adding}>
                      <Plus className="icon" aria-hidden="true" />
                      Add chapter
                    </button>
                  )
                }
              />
              <ChapterList novelId={novelId} chapters={novel.chapters} fromText={novel.sourceType === 'WATTPAD'}
                onReorder={(next) => void reorder(next)} />
            </Tabs.Content>

            {novel.sourceType === 'WATTPAD' && (
              <Tabs.Content value="wattpad" className="tabs__panel">
                <WattpadParts novel={novel} onChanged={reloadNovel} />
              </Tabs.Content>
            )}

            <Tabs.Content value="details" className="tabs__panel">
              <NovelForm
                key={novel.id}
                initial={novel}
                submitLabel="Save"
                pendingLabel="Saving…"
                onDelete={() => void remove()}
                onSubmit={async (input) => {
                  setNovel(await updateNovel(novelId, input));
                  toast.success('Novel saved');
                }}
              />
            </Tabs.Content>

            <Tabs.Content value="notebook" className="tabs__panel">
              <NotebookView novelId={novelId} view={notebook} onView={onNotebook}
                latestPublishedNo={latestPublishedNo(novel.chapters)}
                labels={Object.fromEntries(novel.chapters.map((c) => [c.chapterNo, c.label]))} />
            </Tabs.Content>

            <Tabs.Content value="profile" className="tabs__panel">
              <NovelProfileTab novelId={novelId} sourceType={novel.sourceType} />
            </Tabs.Content>
          </Tabs.Root>
        </>
      )}
    </Page>
  );
}
