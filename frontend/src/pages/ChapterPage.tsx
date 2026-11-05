import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ArrowLeft, ChevronLeft, ChevronRight, Languages, Save, Send, Undo2 } from 'lucide-react';
import { useEffect, useId, useState, type MouseEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import Lightbox from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';
import {
  deletePage,
  getChapter,
  publishChapter,
  reorderPages,
  translateChapter,
  unpublishChapter,
  updateChapter,
  uploadPages,
  type ChapterDetail,
  type PageDto,
} from '../api/novels';
import { chapterLabel } from '../components/novel/ChapterList';
import { PageEditorRow } from '../components/novel/PageEditorRow';
import { PageUploader } from '../components/novel/PageUploader';
import { StatusBadges } from '../components/novel/StatusBadges';
import { Tip } from '../components/Tip';
import { useConfirmDialog } from '../components/useConfirmDialog';
import { useChapterPolling } from '../lib/useChapterPolling';
import { errorMessage, type ErrorMessage } from '../lib/errors';

type Drafts = Record<number, string>;

function draftsOf(pages: PageDto[]): Drafts {
  return Object.fromEntries(pages.map((p) => [p.id, p.textVi ?? '']));
}

/** Novels › chapter: page screenshots, their Vietnamese text side by side, Translate and Publish. */
export default function ChapterPage() {
  const params = useParams();
  const chapterId = Number(params.chapterId);
  const navigate = useNavigate();
  const ids = useId();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [chapter, setChapter] = useState<ChapterDetail | null>(null);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [number, setNumber] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [enlarged, setEnlarged] = useState<number | null>(null);

  /** Takes the server's chapter as the new saved state (drops unsaved edits). */
  function load(c: ChapterDetail) {
    setChapter(c);
    setDrafts(draftsOf(c.pages));
    setNumber(String(c.chapterNo));
    setTitle(c.title ?? '');
  }

  useEffect(() => {
    setChapter(null);
    getChapter(chapterId)
      .then(load)
      .catch((e) => setError(errorMessage(e)));
  }, [chapterId]);

  const translating = chapter?.translationStatus === 'TRANSLATING';
  useChapterPolling(translating ? chapterId : null, (c) => {
    if (c.translationStatus !== 'TRANSLATING') load(c);
  });

  const dirty =
    chapter !== null &&
    (number !== String(chapter.chapterNo) ||
      title !== (chapter.title ?? '') ||
      chapter.pages.some((p) => (drafts[p.id] ?? '') !== (p.textVi ?? '')));

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  /** In-app links ask first when there are unsaved edits. */
  async function leave(e: MouseEvent<HTMLAnchorElement>, to: string) {
    if (!dirty) return;
    e.preventDefault();
    const ok = await confirm({
      title: 'Leave without saving?',
      description: 'Your changes to this chapter are not saved yet.',
      confirmLabel: 'Leave',
      destructive: true,
    });
    if (ok) navigate(to);
  }

  if (!chapter) {
    return (
      <main className="page">
        {error ? (
          <div className="alert" role="alert">
            <p className="alert__title">{error.title}</p>
            {error.hint && <p className="alert__hint">{error.hint}</p>}
          </div>
        ) : (
          <p className="muted">Loading chapter…</p>
        )}
      </main>
    );
  }

  const novelPath = `/novels/${chapter.novelId}`;
  const chapterPath = (id: number) => `${novelPath}/chapters/${id}`;
  const locked = translating || busy;
  // Published: the notebook was built from this chapter, so only its text and title change (Unpublish to do more).
  const published = chapter.publishStatus === 'PUBLISHED';

  async function translate() {
    if (!chapter) return;
    if (chapter.editedAfterTranslation || dirty) {
      const ok = await confirm({
        title: 'Translate this chapter again?',
        description: "Your edits will be replaced by Gemini's new translation.",
        confirmLabel: 'Translate again',
      });
      if (!ok) return;
    }
    await run(async () => load(await translateChapter(chapterId)));
  }

  async function save() {
    if (!chapter) return;
    await run(async () =>
      load(
        await updateChapter(chapterId, {
          chapterNo: Number(number),
          title: title.trim(),
          pages: chapter.pages.map((p) => ({ id: p.id, textVi: drafts[p.id] ?? '' })),
        }),
      ),
    );
  }

  async function upload(files: File[]) {
    setUploading(true);
    setError(null);
    try {
      const pages = await uploadPages(chapterId, files);
      setChapter((c) => (c ? { ...c, pages } : c));
      setDrafts((d) => ({ ...draftsOf(pages), ...d }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  async function reorder(next: PageDto[]) {
    if (!chapter) return;
    const previous = chapter.pages;
    setChapter({ ...chapter, pages: next });
    try {
      const saved = await reorderPages(chapterId, next.map((p) => p.id));
      setChapter((c) => (c ? { ...c, pages: saved } : c));
    } catch (e) {
      setError(errorMessage(e));
      setChapter((c) => (c ? { ...c, pages: previous } : c));
    }
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!chapter || !over || active.id === over.id) return;
    const from = chapter.pages.findIndex((p) => p.id === active.id);
    const to = chapter.pages.findIndex((p) => p.id === over.id);
    if (from < 0 || to < 0) return;
    void reorder(arrayMove(chapter.pages, from, to));
  }

  async function removePage(page: PageDto, n: number) {
    const ok = await confirm({
      title: `Delete page ${n}?`,
      description: 'The screenshot and its translation are deleted.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await run(async () => {
      await deletePage(chapterId, page.id);
      setChapter((c) =>
        c ? { ...c, pages: c.pages.filter((p) => p.id !== page.id).map((p, i) => ({ ...p, position: i + 1 })) } : c,
      );
    });
  }

  return (
    <main className="page chapter-page">
      {confirmDialog}
      <Link className="back-link" to={novelPath} onClick={(e) => void leave(e, novelPath)}>
        <ArrowLeft className="icon" aria-hidden="true" />
        {chapter.novelTitle}
      </Link>

      <section className="chapter-head" aria-label="Chapter">
        <div className="chapter-head__title">
          <h1 className="masthead__name">{chapterLabel(chapter.chapterNo, chapter.title)}</h1>
          <StatusBadges translation={chapter.translationStatus} publish={chapter.publishStatus} />
        </div>
        <div className="chapter-head__actions">
          {!published && (
            <button className="button button--primary" type="button" onClick={() => void translate()}
              disabled={locked || chapter.pages.length === 0}>
              <Languages className="icon" aria-hidden="true" />
              {chapter.translationStatus === 'NONE' ? 'Translate' : 'Translate again'}
            </button>
          )}
          {published ? (
            // Unpublishing reloads the chapter, so it waits until the edits are saved (like Publish).
            <button className="button button--small" type="button" disabled={locked || dirty}
              onClick={() => void run(async () => load(await unpublishChapter(chapterId)))}>
              <Undo2 className="icon" aria-hidden="true" />
              Unpublish
            </button>
          ) : (
            <button className="button button--primary" type="button" disabled={locked || dirty}
              onClick={() => void run(async () => load(await publishChapter(chapterId)))}>
              <Send className="icon" aria-hidden="true" />
              Publish
            </button>
          )}
          <span className="chapter-head__nav">
            {chapter.prevChapterId !== null && (
              <Tip label="Previous chapter">
                <Link className="button button--icon" to={chapterPath(chapter.prevChapterId)} aria-label="Previous chapter"
                  onClick={(e) => void leave(e, chapterPath(chapter.prevChapterId!))}>
                  <ChevronLeft className="icon" aria-hidden="true" />
                </Link>
              </Tip>
            )}
            {chapter.nextChapterId !== null && (
              <Tip label="Next chapter">
                <Link className="button button--icon" to={chapterPath(chapter.nextChapterId)} aria-label="Next chapter"
                  onClick={(e) => void leave(e, chapterPath(chapter.nextChapterId!))}>
                  <ChevronRight className="icon" aria-hidden="true" />
                </Link>
              </Tip>
            )}
          </span>
        </div>
        {translating && <p className="muted" aria-live="polite">Gemini is reading and translating the pages…</p>}
        {chapter.translationStatus === 'FAILED' && chapter.translationError && (
          <p className="field__error">{chapter.translationError}</p>
        )}
      </section>

      {error && (
        <div className="alert" role="alert">
          <p className="alert__title">{error.title}</p>
          {error.hint && <p className="alert__hint">{error.hint}</p>}
        </div>
      )}

      <div className="chapter-meta">
        <div className="field">
          <label htmlFor={`${ids}-no`}>Chapter number</label>
          <input id={`${ids}-no`} type="text" inputMode="numeric" value={number} disabled={locked || published}
            onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))} />
        </div>
        <div className="field">
          <label htmlFor={`${ids}-title`}>Chapter title (optional)</label>
          <input id={`${ids}-title`} type="text" maxLength={200} value={title} disabled={locked}
            onChange={(e) => setTitle(e.target.value)} />
        </div>
      </div>

      {published ? (
        <p className="chapter-note">
          This chapter is published: only the text can be edited. Unpublish to change pages or translate again.
        </p>
      ) : (
        <PageUploader disabled={translating} busy={uploading} onFiles={(files) => void upload(files)} />
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={chapter.pages.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          <ol className="page-list" aria-label="Pages">
            {chapter.pages.map((p, i) => (
              <PageEditorRow
                key={p.id}
                page={p}
                number={i + 1}
                text={drafts[p.id] ?? ''}
                locked={locked}
                fixedPages={published}
                onText={(t) => setDrafts((d) => ({ ...d, [p.id]: t }))}
                onEnlarge={() => setEnlarged(i)}
                onDelete={() => void removePage(p, i + 1)}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      <div className="chapter-save">
        <button className="button button--primary" type="button" onClick={() => void save()} disabled={locked || !dirty || !number}>
          <Save className="icon" aria-hidden="true" />
          Save
        </button>
        {dirty && <span className="muted">Unsaved changes</span>}
      </div>

      <Lightbox
        open={enlarged !== null}
        index={enlarged ?? 0}
        close={() => setEnlarged(null)}
        slides={chapter.pages.map((p, i) => ({ src: p.mediaUrl, alt: `Page ${i + 1}` }))}
      />
    </main>
  );
}
