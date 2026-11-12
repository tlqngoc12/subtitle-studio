import * as Tabs from '@radix-ui/react-tabs';
import { TabTrigger } from '../components/ui/TabTrigger';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import {
  addChapter,
  deleteNovel,
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
import { WattpadParts } from '../components/novel/WattpadParts';
import { useConfirmDialog } from '../components/useConfirmDialog';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import { STATUS_LABEL } from './NovelsPage';
import { Alert } from '../components/ui/Alert';
import { LoadingText } from '../components/ui/LoadingText';
import { Cover } from '../components/ui/Cover';
import './NovelPage.css';

/** Novels › one novel: Chapters | Details | Notebook. The novel is loaded once for every tab. */
export default function NovelPage() {
  const { id } = useParams();
  const novelId = Number(id);
  const navigate = useNavigate();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [novel, setNovel] = useState<NovelDetail | null>(null);
  const [notebook, setNotebook] = useState<NotebookData | null>(null);
  const [search] = useSearchParams();
  const [tab, setTab] = useState(search.get('tab') === 'wattpad' ? 'wattpad' : 'chapters');
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    getNovel(novelId)
      .then(setNovel)
      .catch((e) => setError(errorMessage(e)));
  }, [novelId]);

  /** Reloads the novel (its chapter list) after parts were imported. */
  const reloadNovel = useCallback(() => {
    getNovel(novelId)
      .then(setNovel)
      .catch((e) => setError(errorMessage(e)));
  }, [novelId]);

  const onNotebook = useCallback((v: NotebookData) => setNotebook(v), []);

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
    <main className="page">
      {confirmDialog}
      <Link className="back-link" to="/novels">
        <ArrowLeft className="icon" aria-hidden="true" />
        Novels
      </Link>
      {error && (
        <Alert title={error.title} hint={error.hint} />
      )}
      {!novel ? (
        !error && <LoadingText>Loading novel…</LoadingText>
      ) : (
        <>
          <header className="novel-head">
            <Cover src={novel.coverUrl} />
            <div className="novel-head__text">
              <h1 className="masthead__name">{novel.title}</h1>
              <span className="badge badge--info">{STATUS_LABEL[novel.novelStatus]}</span>
            </div>
          </header>

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
            </Tabs.List>

            <Tabs.Content value="chapters" className="tabs__panel">
              <button className="button button--primary" type="button" onClick={add} disabled={adding}>
                <Plus className="icon" aria-hidden="true" />
                Add chapter
              </button>
              <ChapterList novelId={novelId} chapters={novel.chapters} fromText={novel.sourceType === 'WATTPAD'}
                onReorder={(next) => void reorder(next)} />
            </Tabs.Content>

            {novel.sourceType === 'WATTPAD' && (
              <Tabs.Content value="wattpad" className="tabs__panel">
                <WattpadParts novelId={novelId} onImported={reloadNovel} />
              </Tabs.Content>
            )}

            <Tabs.Content value="details" className="tabs__panel">
              <NovelForm
                key={novel.id}
                initial={novel}
                submitLabel="Save"
                pendingLabel="Saving…"
                onSubmit={async (input) => {
                  setNovel(await updateNovel(novelId, input));
                  toast.success('Novel saved');
                }}
              />
              <div className="danger-zone">
                <button className="button button--danger" type="button" onClick={remove}>
                  <Trash2 className="icon" aria-hidden="true" />
                  Delete novel
                </button>
              </div>
            </Tabs.Content>

            <Tabs.Content value="notebook" className="tabs__panel">
              <NotebookView novelId={novelId} view={notebook} onView={onNotebook}
                labels={Object.fromEntries(novel.chapters.map((c) => [c.chapterNo, c.label]))} />
            </Tabs.Content>
          </Tabs.Root>
        </>
      )}
    </main>
  );
}
