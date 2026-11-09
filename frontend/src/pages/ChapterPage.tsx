import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  Languages,
  RotateCcw,
  RotateCw,
  Save,
  Send,
  TriangleAlert,
  Undo2,
} from 'lucide-react';
import { useEffect, useId, useState, type MouseEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import Lightbox, { useLightboxState } from 'yet-another-react-lightbox';
import Captions from 'yet-another-react-lightbox/plugins/captions';
import 'yet-another-react-lightbox/plugins/captions.css';
import 'yet-another-react-lightbox/styles.css';
import {
  deletePage,
  getChapter,
  publishChapter,
  reorderPages,
  rotatePage,
  rotatePages,
  translateChapter,
  unpublishChapter,
  updateChapter,
  uploadPages,
  type ChapterDetail,
  type PageDto,
  type RotateDirection,
} from '../api/novels';
import { chapterLabel } from '../components/novel/ChapterList';
import { PageRow } from '../components/novel/PageRow';
import { PageUploader } from '../components/novel/PageUploader';
import { StatusBadges } from '../components/novel/StatusBadges';
import { Tip } from '../components/Tip';
import { useConfirmDialog } from '../components/useConfirmDialog';
import { useChapterPolling } from '../lib/useChapterPolling';
import { errorMessage, type ErrorMessage } from '../lib/errors';

/**
 * Novels › chapter. Draft: page screenshots (upload, order, delete), Translate, Publish, and the whole chapter's text
 * in one box. Published: only the text and title, until Unpublish.
 */
export default function ChapterPage() {
  const params = useParams();
  const chapterId = Number(params.chapterId);
  const navigate = useNavigate();
  const ids = useId();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [chapter, setChapter] = useState<ChapterDetail | null>(null);
  const [text, setText] = useState('');
  const [number, setNumber] = useState('');
  const [label, setLabel] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [enlarged, setEnlarged] = useState<number | null>(null);

  /** Takes the server's chapter as the new saved state (drops unsaved edits). */
  function load(c: ChapterDetail) {
    setChapter(c);
    setText(c.text);
    setNumber(String(c.chapterNo));
    setLabel(c.label ?? '');
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
      label !== (chapter.label ?? '') ||
      title !== (chapter.title ?? '') ||
      text !== chapter.text);

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
  const suspectNumbers = chapter.pages.flatMap((p, i) => (p.suspect ? [i + 1] : []));

  async function translate() {
    if (!chapter) return;
    const landscape = chapter.pages.filter((p) => p.landscape).length;
    if (landscape > 0) {
      const ok = await confirm({
        title: 'Landscape pages',
        description: `${landscape} page(s) are landscape — Gemini reads sideways text poorly. Translate anyway?`,
        confirmLabel: 'Translate anyway',
      });
      if (!ok) return;
    }
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
          label: label.trim(),
          title: title.trim(),
          text,
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

  async function rotate(page: PageDto, direction: RotateDirection) {
    await run(async () => {
      const pages = await rotatePage(chapterId, page.id, direction);
      setChapter((c) => (c ? { ...c, pages } : c));
    });
  }

  async function rotateAll(direction: RotateDirection) {
    await run(async () => {
      const pages = await rotatePages(chapterId, direction);
      setChapter((c) => (c ? { ...c, pages } : c));
    });
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
          <h1 className="masthead__name">{chapterLabel(chapter.chapterNo, chapter.title, chapter.label)}</h1>
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
        {!published && (
          <div className="field">
            <label htmlFor={`${ids}-no`}>Order</label>
            <input id={`${ids}-no`} type="text" inputMode="numeric" value={number} disabled={locked}
              aria-describedby={`${ids}-no-hint`}
              onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))} />
            <p className="field__hint" id={`${ids}-no-hint`}>Sorts the chapters and is the chapter's link number.</p>
          </div>
        )}
        <div className="field">
          <label htmlFor={`${ids}-label`}>Chapter label (optional)</label>
          <input id={`${ids}-label`} type="text" maxLength={100} value={label} disabled={locked}
            placeholder={`Chapter ${number || chapter.chapterNo}`} aria-describedby={`${ids}-label-hint`}
            onChange={(e) => setLabel(e.target.value)} />
          <p className="field__hint" id={`${ids}-label-hint`}>Shown instead of the number, e.g. Ngoại truyện 1, Special.</p>
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
        <section className="chapter-pages" aria-labelledby={`${ids}-pages`}>
          <h2 id={`${ids}-pages`} className="history__heading">Pages</h2>
          <PageUploader disabled={translating} busy={uploading} onFiles={(files) => void upload(files)} />
          {chapter.pages.length > 0 && (
            <div className="chapter-pages__rotate">
              <button className="button button--small" type="button" disabled={locked} onClick={() => void rotateAll('LEFT')}>
                <RotateCcw className="icon" aria-hidden="true" />
                Rotate all left
              </button>
              <button className="button button--small" type="button" disabled={locked} onClick={() => void rotateAll('RIGHT')}>
                <RotateCw className="icon" aria-hidden="true" />
                Rotate all right
              </button>
            </div>
          )}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={chapter.pages.map((p) => p.id)} strategy={rectSortingStrategy}>
              <ol className="page-grid" aria-label="Pages">
                {chapter.pages.map((p, i) => (
                  <PageRow
                    key={p.id}
                    page={p}
                    number={i + 1}
                    locked={locked}
                    onEnlarge={() => setEnlarged(i)}
                    onRotate={(d) => void rotate(p, d)}
                    onDelete={() => void removePage(p, i + 1)}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        </section>
      )}

      {suspectNumbers.length > 0 && (
        <p className="chapter-warning">
          <TriangleAlert className="icon" aria-hidden="true" />
          {suspectNumbers.length === 1 ? 'Page ' : 'Pages '}
          {suspectNumbers.map((n, i) => (
            <span key={n}>
              <button className="chapter-warning__page" type="button" aria-label={`Show page ${n}`}
                onClick={() => setEnlarged(n - 1)}>
                {n}
              </button>
              {i < suspectNumbers.length - 1 ? ', ' : ''}
            </span>
          ))}
          {' may be incomplete'}
        </p>
      )}

      <div className="field chapter-text">
        <label htmlFor={`${ids}-text`}>Chapter text</label>
        <textarea id={`${ids}-text`} rows={24} value={text} disabled={locked}
          onChange={(e) => setText(e.target.value)} />
      </div>

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
        plugins={[Captions]}
        captions={{ descriptionMaxLines: 12 }}
        toolbar={{ buttons: [<CopySourceButton key="copy-source" sources={chapter.pages.map((p) => p.source)} />, 'close'] }}
        slides={chapter.pages.map((p, i) => ({
          src: p.mediaUrl,
          alt: `Page ${i + 1}`,
          title: `Page ${i + 1}`,
          description: p.source ? `Source read by AI:
${p.source}` : undefined,
        }))}
      />
    </main>
  );
}

/** Lightbox toolbar button: copies the Thai text Gemini read from the slide on screen; hidden when there is none. */
function CopySourceButton({ sources }: { sources: (string | null)[] }) {
  const { state } = useLightboxState();
  const source = sources[state.currentIndex];
  if (!source) return null;
  return (
    <button className="yarl__button" type="button" aria-label="Copy source"
      onClick={() => void navigator.clipboard.writeText(source)}>
      <Copy className="icon" aria-hidden="true" />
    </button>
  );
}
