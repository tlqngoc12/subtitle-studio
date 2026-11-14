import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import {
  ChevronLeft,
  ChevronRight,
  CloudDownload,
  Copy,
  Info,
  Languages,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Send,
  TriangleAlert,
  Undo2,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import Lightbox, { useLightboxState } from 'yet-another-react-lightbox';
import Captions from 'yet-another-react-lightbox/plugins/captions';
import 'yet-another-react-lightbox/plugins/captions.css';
import 'yet-another-react-lightbox/styles.css';
import {
  deletePage,
  fetchTranslateNext,
  getChapter,
  publishChapter,
  reloadChapterOriginal,
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
import { formatInstantWithTime } from '../lib/dates';
import { PageRow } from '../components/novel/PageRow';
import { PageUploader } from '../components/novel/PageUploader';
import { StatusBadges } from '../components/novel/StatusBadges';
import { Tip } from '../components/Tip';
import { useConfirmDialog } from '../components/useConfirmDialog';
import { useChapterPolling } from '../lib/useChapterPolling';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import { toastError } from '../lib/toast';
import { Alert } from '../components/ui/Alert';
import { FormActions } from '../components/ui/FormActions';
import { Page } from '../components/ui/Page';
import { PageHeader } from '../components/ui/PageHeader';
import { PageSkeleton } from '../components/ui/Skeleton';
import { IconLink } from '../components/ui/IconButton';
import './ChapterPage.css';

/** Unsaved edits are saved by themselves this often (3 minutes). */
export const AUTO_SAVE_MS = 180_000;

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
  const [starting, setStarting] = useState(false);
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
    setStarting(false); // the page is reused for the chapter just opened
    getChapter(chapterId)
      .then(load)
      .catch((e) => setError(errorMessage(e)));
  }, [chapterId]);

  const translating = chapter?.translationStatus === 'TRANSLATING';
  useChapterPolling(translating ? chapterId : null, (c) => {
    if (c.translationStatus !== 'TRANSLATING') {
      load(c);
    } else {
      // A fallback model took over: show it, keep the edits.
      setChapter((prev) => (prev ? { ...prev, translationModel: c.translationModel } : prev));
    }
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

  // Save is allowed only for a loaded, edited chapter that is not busy/translating and has a Number.
  const canSave = dirty && !translating && !busy && number !== '';
  const saveRef = useRef<(auto: boolean) => Promise<void>>(async () => {});
  const canSaveRef = useRef(canSave);
  canSaveRef.current = canSave;

  // Ctrl+S / ⌘S saves instead of opening the browser's "save page" dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      if (canSaveRef.current) void saveRef.current(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // One timer while there are savable unsaved changes; the browser-side checks repeat at fire time.
  useEffect(() => {
    if (!canSave) return;
    const id = window.setInterval(() => {
      if (canSaveRef.current) void saveRef.current(true);
    }, AUTO_SAVE_MS);
    return () => window.clearInterval(id);
  }, [canSave]);

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
      <Page width="narrow">
        {error ? <Alert title={error.title} hint={error.hint} /> : <PageSkeleton rows={3} />}
      </Page>
    );
  }

  const novelPath = `/novels/${chapter.novelId}`;
  const chapterPath = (id: number) => `${novelPath}/chapters/${id}`;
  const locked = translating || busy;
  // Published: the notebook was built from this chapter, so only its text and title change (Unpublish to do more).
  const published = chapter.publishStatus === 'PUBLISHED';
  // A Wattpad chapter: the original is text on the left, there are no page screenshots.
  const fromText = chapter.sourceText !== null;
  // The Original column is a draft tool: once published, a text chapter looks and behaves like a screenshot chapter.
  const showOriginal = fromText && !published;
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

  /** Fetches and translates the next Wattpad part, then opens its chapter (it polls itself while translating). */
  async function startNext() {
    if (!chapter) return;
    if (dirty) {
      const ok = await confirm({
        title: 'Leave without saving?',
        description: 'Your changes to this chapter are not saved yet.',
        confirmLabel: 'Leave',
        destructive: true,
      });
      if (!ok) return;
    }
    setStarting(true);
    try {
      const next = await fetchTranslateNext(chapter.novelId);
      toast.info('Translation started', {
        description: next.title ?? chapterLabel(next.chapterNo, next.title, next.label),
      });
      navigate(chapterPath(next.id));
    } catch (e) {
      toastError(errorMessage(e));
      setStarting(false);
    }
  }

  async function reloadOriginal() {
    const ok = await confirm({
      title: 'Reload the original text?',
      description: 'The original is fetched from Wattpad again and replaces the one shown here. Your translation is not changed.',
      confirmLabel: 'Reload original',
    });
    if (!ok) return;
    await run(async () => {
      const fresh = await reloadChapterOriginal(chapterId);
      // Only the original changes: edits in the boxes below stay.
      setChapter((c) => (c ? { ...c, sourceText: fresh.sourceText, sourceFetchedAt: fresh.sourceFetchedAt } : c));
      toast.success('Original text reloaded');
    });
  }

  async function save(auto = false) {
    if (!chapter) return;
    await run(async () => {
      load(
        await updateChapter(chapterId, {
          chapterNo: Number(number),
          label: label.trim(),
          title: title.trim(),
          text,
        }),
      );
      toast.success(auto ? 'Chapter auto-saved' : 'Chapter saved');
    });
  }
  saveRef.current = save;

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
    <Page width={showOriginal ? 'default' : 'narrow'} className="chapter-page">
      {confirmDialog}
      <PageHeader
        breadcrumbs={[
          { label: 'Novels', to: '/novels' },
          { label: chapter.novelTitle, to: novelPath },
          { label: chapterLabel(chapter.chapterNo, chapter.title, chapter.label) },
        ]}
        onNavigate={(e, to) => void leave(e, to)}
        title={chapterLabel(chapter.chapterNo, chapter.title, chapter.label)}
        meta={<StatusBadges translation={chapter.translationStatus} publish={chapter.publishStatus} />}
        actions={
          <>
            <span className="chapter-head__nav">
              {chapter.prevChapterId !== null && (
                <IconLink label="Previous chapter" icon={ChevronLeft} to={chapterPath(chapter.prevChapterId)}
                  onClick={(e) => void leave(e, chapterPath(chapter.prevChapterId!))} />
              )}
              {chapter.nextChapterId !== null && (
                <IconLink label="Next chapter" icon={ChevronRight} to={chapterPath(chapter.nextChapterId)}
                  onClick={(e) => void leave(e, chapterPath(chapter.nextChapterId!))} />
              )}
              {/* The last chapter of a Wattpad novel: start the next part from here instead of the Wattpad tab. */}
              {chapter.wattpadPartId !== null && chapter.nextChapterId === null && (
                <Tip label="Wait until this chapter finishes translating." disabled={!translating}>
                  <span className="chapter-head__next">
                    <button className="button" type="button" disabled={locked || starting}
                      onClick={() => void startNext()}>
                      <CloudDownload className="icon" aria-hidden="true" />
                      {starting ? 'Starting…' : 'Fetch & translate next'}
                    </button>
                  </span>
                </Tip>
              )}
            </span>
            {!published && (
              <button className="button" type="button" onClick={() => void translate()}
                disabled={locked || (!fromText && chapter.pages.length === 0)}>
                <Languages className="icon" aria-hidden="true" />
                {chapter.translationStatus === 'NONE' ? 'Translate' : 'Translate again'}
              </button>
            )}
            {published ? (
              // Unpublishing reloads the chapter, so it waits until the edits are saved (like Publish).
              <button className="button" type="button" disabled={locked || dirty}
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
          </>
        }
      />

      {(translating || (chapter.translationStatus === 'TRANSLATED' && chapter.translationModel) ||
        (chapter.translationStatus === 'FAILED' && chapter.translationError)) && (
        <div className="chapter-status">
          {translating && (
            <p className="muted" aria-live="polite">
              {chapter.translationModel
                ? `Translating with ${chapter.translationModel}…`
                : fromText
                  ? 'Gemini is translating the chapter…'
                  : 'Gemini is reading and translating the pages…'}
            </p>
          )}
          {!translating && chapter.translationStatus === 'TRANSLATED' && chapter.translationModel && (
            <p className="muted">Translated by {chapter.translationModel}</p>
          )}
          {chapter.translationStatus === 'FAILED' && chapter.translationError && (
            <p className="field__error">{chapter.translationError}</p>
          )}
        </div>
      )}

      {error && (
        <Alert title={error.title} hint={error.hint} />
      )}

      <div className="chapter-meta">
        <div className="chapter-meta__row">
          {!published && (
            <div className="field chapter-meta__number">
              <div className="field__label-row">
                <label htmlFor={`${ids}-no`}>Number</label>
                <Tip label="The chapter's link number. Drag chapters in the list to change the reading order.">
                  <button className="info-icon" type="button" aria-label="About Number">
                    <Info className="icon" aria-hidden="true" />
                  </button>
                </Tip>
              </div>
              <input id={`${ids}-no`} type="text" inputMode="numeric" value={number} disabled={locked}
                onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))} />
            </div>
          )}
          <div className="field chapter-meta__label">
            <div className="field__label-row">
              <label htmlFor={`${ids}-label`}>Chapter label (optional)</label>
              <Tip label="Shown instead of the number, e.g. Ngoại truyện 1, Special.">
                <button className="info-icon" type="button" aria-label="About Chapter label">
                  <Info className="icon" aria-hidden="true" />
                </button>
              </Tip>
            </div>
            <input id={`${ids}-label`} type="text" maxLength={100} value={label} disabled={locked}
              placeholder="e.g. Ngoại truyện 1"
              onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="field chapter-meta__title">
            <label htmlFor={`${ids}-title`}>Chapter title (optional)</label>
            <input id={`${ids}-title`} type="text" maxLength={200} value={title} disabled={locked}
              onChange={(e) => setTitle(e.target.value)} />
          </div>
        </div>
      </div>

      {published ? (
        <p className="chapter-note">
          This chapter is published: only the text can be edited.{' '}
          {fromText ? 'Unpublish to translate again.' : 'Unpublish to change pages or translate again.'}
        </p>
      ) : (
        !fromText && (
        <section className="chapter-pages" aria-labelledby={`${ids}-pages`}>
          <h2 id={`${ids}-pages`} className="history__heading">Pages</h2>
          <PageUploader disabled={translating} busy={uploading} onFiles={(files) => void upload(files)} />
          {chapter.pages.length > 0 && (
            <div className="chapter-pages__rotate">
              <button className="button button--s" type="button" disabled={locked} onClick={() => void rotateAll('LEFT')}>
                <RotateCcw className="icon" aria-hidden="true" />
                Rotate all left
              </button>
              <button className="button button--s" type="button" disabled={locked} onClick={() => void rotateAll('RIGHT')}>
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
        )
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

      <div className={showOriginal ? 'chapter-columns' : undefined}>
        {showOriginal && (
          <section className="chapter-original" aria-labelledby={`${ids}-original`}>
            <div className="chapter-original__head">
              <h2 id={`${ids}-original`} className="history__heading">
                Original ({chapter.sourceLanguage === 'en' ? 'English' : 'Thai'})
              </h2>
              <button className="button button--s" type="button" disabled={locked} onClick={() => void reloadOriginal()}>
                <RefreshCw className="icon" aria-hidden="true" />
                Reload original
              </button>
            </div>
            <div className="chapter-original__text" role="region" aria-label="Original text" tabIndex={0}
              lang={chapter.sourceLanguage}>
              {chapter.sourceText}
            </div>
            {chapter.sourceFetchedAt && (
              <p className="muted">Fetched from Wattpad {formatInstantWithTime(chapter.sourceFetchedAt)}</p>
            )}
          </section>
        )}
        <div className="field chapter-text">
          <label htmlFor={`${ids}-text`}>Chapter text</label>
          <textarea id={`${ids}-text`} rows={24} value={text} disabled={locked}
            onChange={(e) => setText(e.target.value)} />
        </div>
      </div>

      <FormActions sticky start={dirty && <span className="muted form-actions__label">Unsaved changes</span>}>
        <button className="button button--primary" type="button" onClick={() => void save()} disabled={locked || !dirty || !number}>
          Save
        </button>
      </FormActions>

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
    </Page>
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
