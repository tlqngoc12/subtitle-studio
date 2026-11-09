import * as Tabs from '@radix-ui/react-tabs';
import { ArrowLeft, BookOpen, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import {
  addChapter,
  deleteNovel,
  getNovel,
  updateNovel,
  type NotebookView as NotebookData,
  type NovelDetail,
} from '../api/novels';
import { ChapterList } from '../components/novel/ChapterList';
import { NotebookView } from '../components/novel/NotebookView';
import { NovelForm } from '../components/novel/NovelForm';
import { useConfirmDialog } from '../components/useConfirmDialog';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import { STATUS_LABEL } from './NovelsPage';

/** Novels › one novel: Chapters | Details | Notebook. The novel is loaded once for every tab. */
export default function NovelPage() {
  const { id } = useParams();
  const novelId = Number(id);
  const navigate = useNavigate();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [novel, setNovel] = useState<NovelDetail | null>(null);
  const [notebook, setNotebook] = useState<NotebookData | null>(null);
  const [tab, setTab] = useState('chapters');
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
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
        <div className="alert" role="alert">
          <p className="alert__title">{error.title}</p>
          {error.hint && <p className="alert__hint">{error.hint}</p>}
        </div>
      )}
      {!novel ? (
        !error && <p className="muted">Loading novel…</p>
      ) : (
        <>
          <header className="novel-head">
            {novel.coverUrl ? (
              <img className="novel-card__cover" src={novel.coverUrl} alt="" />
            ) : (
              <span className="novel-card__cover novel-card__cover--empty" aria-hidden="true">
                <BookOpen className="icon" />
              </span>
            )}
            <div className="novel-head__text">
              <h1 className="masthead__name">{novel.title}</h1>
              <span className="badge badge--info">{STATUS_LABEL[novel.novelStatus]}</span>
            </div>
          </header>

          <Tabs.Root value={tab} onValueChange={setTab} className="tabs">
            <Tabs.List className="tabs__list" aria-label="Novel sections">
              <Tabs.Trigger className="tabs__tab" value="chapters">
                Chapters
              </Tabs.Trigger>
              <Tabs.Trigger className="tabs__tab" value="details">
                Details
              </Tabs.Trigger>
              <Tabs.Trigger className="tabs__tab" value="notebook">
                Notebook
              </Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content value="chapters" className="tabs__panel">
              <button className="button button--primary" type="button" onClick={add} disabled={adding}>
                <Plus className="icon" aria-hidden="true" />
                Add chapter
              </button>
              <ChapterList novelId={novelId} chapters={novel.chapters} />
            </Tabs.Content>

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
