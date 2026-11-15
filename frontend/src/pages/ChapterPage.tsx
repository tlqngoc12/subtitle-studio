import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import {
  ChevronLeft,
  ChevronRight,
  CloudDownload,
  Copy,
  Info,
  RotateCcw,
  RotateCw,
  Search,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from 'react';
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
import { countText, paragraphIndexAt, paragraphs } from '../lib/chapterText';
import { DisclosureSummary } from '../components/ui/DisclosureSummary';
import { OriginalPanel } from '../components/novel/OriginalPanel';
import { ChapterBar, type ChapterMenuItem, type SaveState } from '../components/novel/ChapterBar';
import { useAutoGrow } from '../lib/useAutoGrow';
import { useMediaQuery } from '../lib/useMediaQuery';
import { PageRow } from '../components/novel/PageRow';
import { PageUploader } from '../components/novel/PageUploader';
import { StatusBadges } from '../components/novel/StatusBadges';
import { Tip } from '../components/Tip';
import { useConfirmDialog } from '../components/useConfirmDialog';
import { useChapterPolling } from '../lib/useChapterPolling';
import { busyTitle, chapterBusy } from '../lib/novelBusy';
import { BusyLine } from '../components/novel/BusyLine';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import { toastError } from '../lib/toast';
import { Alert } from '../components/ui/Alert';
import { Page } from '../components/ui/Page';
import { PageHeader } from '../components/ui/PageHeader';
import { PageSkeleton } from '../components/ui/Skeleton';
import { IconButton, IconLink } from '../components/ui/IconButton';
import { FindReplace } from '../components/novel/FindReplace';
import './ChapterPage.css';

/** Unsaved edits are saved by themselves this often (15 minutes). */
export const AUTO_SAVE_MS = 900_000;
const COUNT_DEBOUNCE_MS = 300;
/** Below this share of the original's paragraphs the translation probably lost a part. */
const MIN_PARAGRAPH_SHARE = 0.9;

const DETAILS_KEY = 'chapter-details-open';

function readDetailsChoice(): boolean | null {
  try {
    const stored = localStorage.getItem(DETAILS_KEY);
    return stored === '1' ? true : stored === '0' ? false : null;
  } catch {
    return null; // storage blocked: the width decides
  }
}

function writeDetailsChoice(open: boolean) {
  try {
    localStorage.setItem(DETAILS_KEY, open ? '1' : '0');
  } catch {
    // storage blocked: the choice lasts until the page closes
  }
}

const plural = (n: number, noun: string) => `${n.toLocaleString('en')} ${noun}${n === 1 ? '' : 's'}`;

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
  const [saving, setSaving] = useState(false);
  const [lastSave, setLastSave] = useState<{ kind: 'saved' | 'autosaved'; at: Date } | null>(null);
  // The details (number, label, title, translated by) start closed on a phone so the text comes first; the person's
  // own choice is remembered.
  const roomy = useMediaQuery('(min-width: 761px)');
  const [detailsChoice, setDetailsChoice] = useState<boolean | null>(readDetailsChoice);
  const detailsOpen = detailsChoice ?? roomy;
  const textRef = useRef<HTMLTextAreaElement>(null);
  useAutoGrow(textRef, text);
  const [finding, setFinding] = useState(false);
  // The paragraph the caret is in (matched with the original's paragraph of the same number).
  const [activeParagraph, setActiveParagraph] = useState<number | null>(null);
  function trackCaret(el: HTMLTextAreaElement) {
    if (chapter?.sourceText == null) return; // only a chapter with an original has paragraphs to match
    setActiveParagraph(paragraphIndexAt(el.value, el.selectionStart));
  }

  // The counts follow the text about 300 ms after the last key, so typing in a long chapter stays light.
  const [counted, setCounted] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setCounted(text), COUNT_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [text]);
  const counts = useMemo(() => countText(counted), [counted]);
  const originalParagraphs = useMemo(
    () => (chapter?.sourceText != null ? paragraphs(chapter.sourceText).length : null),
    [chapter?.sourceText],
  );

  /** Takes the server's chapter as the new saved state (drops unsaved edits). */
  function load(c: ChapterDetail) {
    setChapter(c);
    setText(c.text);
    setCounted(c.text);
    setNumber(String(c.chapterNo));
    setLabel(c.label ?? '');
    setTitle(c.title ?? '');
  }

  useEffect(() => {
    setChapter(null);
    setStarting(false); // the page is reused for the chapter just opened
    setLastSave(null);
    getChapter(chapterId)
      .then(load)
      .catch((e) => setError(errorMessage(e)));
  }, [chapterId]);

  const translating = chapter?.translationStatus === 'TRANSLATING';
  const notebookUpdating = chapter?.notebookStatus === 'UPDATING';
  // Poll while this chapter translates, and while the notebook updates (no other chapter can start then).
  useChapterPolling(translating || notebookUpdating ? chapterId : null, (c) => {
    if (!translating) {
      // Only the notebook is running: take its state and keep every edit.
      setChapter((prev) =>
        prev ? { ...prev, notebookStatus: c.notebookStatus, notebookChapterNo: c.notebookChapterNo } : prev,
      );
    } else if (c.translationStatus !== 'TRANSLATING') {
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

  // Ctrl+S / ⌘S saves instead of opening the browser's "save page" dialog; Ctrl+H / ⌘H opens find and replace
  // instead of the browser's history.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'h') {
        e.preventDefault();
        setFinding(true);
      } else if (key === 's') {
        e.preventDefault();
        if (canSaveRef.current) void saveRef.current(false);
      }
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
    setSaving(true);
    try {
      await run(async () => {
        load(
          await updateChapter(chapterId, {
            chapterNo: Number(number),
            label: label.trim(),
            title: title.trim(),
            text,
          }),
        );
        setLastSave({ kind: auto ? 'autosaved' : 'saved', at: new Date() });
        toast.success(auto ? 'Chapter auto-saved' : 'Chapter saved');
      });
    } finally {
      setSaving(false);
    }
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

  const why = chapterBusy(chapter); // why no translation can start now (null = it can)
  const saveState: SaveState = saving ? { kind: 'saving' } : dirty ? { kind: 'dirty' } : (lastSave ?? { kind: 'idle' });
  const menuItems: ChapterMenuItem[] = [
    ...(published
      ? [
          {
            label: 'Unpublish',
            // Unpublishing reloads the chapter, so it waits until the edits are saved (like Publish).
            disabled: locked || dirty,
            onSelect: () => void run(async () => load(await unpublishChapter(chapterId))),
          },
        ]
      : [
          {
            label: chapter.translationStatus === 'NONE' ? 'Translate' : 'Translate again',
            // Translating again replaces the text, edits included.
            danger: chapter.translationStatus !== 'NONE',
            disabled: locked || (!fromText && chapter.pages.length === 0),
            // The notebook is updating: no chapter of this novel can translate until it is done.
            disabledReason: why?.reason === 'NOTEBOOK_UPDATING' ? busyTitle(why) : undefined,
            onSelect: () => void translate(),
          },
        ]),
    ...(showOriginal ? [{ label: 'Reload original', disabled: locked, onSelect: () => void reloadOriginal() }] : []),
  ];

  return (
    <Page width={showOriginal ? 'wide' : 'narrow'} className="chapter-page">
      {confirmDialog}
      <PageHeader
        breadcrumbs={[
          { label: 'Novels', to: '/novels' },
          { label: chapter.novelTitle, to: novelPath },
          { label: chapterLabel(chapter.chapterNo, chapter.title, chapter.label) },
        ]}
        onNavigate={(e, to) => void leave(e, to)}
        title={chapterLabel(chapter.chapterNo, chapter.title, chapter.label)}
      />

      <ChapterBar
        nav={
          <>
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
              <Tip label={why ? busyTitle(why) : ''} disabled={!why}>
                <span className="chapter-head__next">
                  <button className="button" type="button" disabled={locked || starting || why !== null}
                    onClick={() => void startNext()}>
                    <CloudDownload className="icon" aria-hidden="true" />
                    {starting ? 'Starting…' : 'Fetch & translate next'}
                  </button>
                </span>
              </Tip>
            )}
          </>
        }
        // Short: the H1 above already shows the full title.
        title={chapter.label?.trim() || `Chapter ${chapter.chapterNo}`}
        badges={<StatusBadges translation={chapter.translationStatus} publish={chapter.publishStatus} />}
        saveState={saveState}
        canSave={canSave}
        onSave={() => void save()}
        publish={
          published
            ? undefined
            : {
                onPublish: () => void run(async () => load(await publishChapter(chapterId))),
                disabledReason: translating
                  ? 'Wait until this chapter finishes translating.'
                  : busy
                    ? 'Wait until the current action finishes.'
                    : null,
              }
        }
        menuItems={menuItems}
        tools={
          <IconButton label="Find and replace" icon={Search} disabled={locked} aria-pressed={finding}
            onClick={() => setFinding((f) => !f)} />
        }
        below={
          finding ? (
            <FindReplace text={text} onChange={setText} textareaRef={textRef} onClose={() => setFinding(false)} />
          ) : undefined
        }
      />

      <p className="chapter-count muted">
        {plural(counts.words, 'word')} · {plural(counts.characters, 'character')} · {plural(counts.paragraphs, 'paragraph')}
        {originalParagraphs !== null && <ParagraphShare have={counts.paragraphs} of={originalParagraphs} />}
      </p>

      {published && (
        <p className="chapter-note muted">
          This chapter is published: only the text can be edited.{' '}
          {fromText ? 'Unpublish to translate again.' : 'Unpublish to change pages or translate again.'}
        </p>
      )}

      {why?.reason === 'NOTEBOOK_UPDATING' && <BusyLine busy={why} />}

      {(translating || (chapter.translationStatus === 'FAILED' && chapter.translationError)) && (
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
          {chapter.translationStatus === 'FAILED' && chapter.translationError && (
            <p className="field__error">{chapter.translationError}</p>
          )}
        </div>
      )}

      {error && (
        <Alert title={error.title} hint={error.hint} />
      )}

      <details
        className="chapter-details"
        open={detailsOpen}
        onToggle={(e) => {
          // React also fires toggle when it sets `open` itself; only a real change by the person is remembered.
          const now = e.currentTarget.open;
          if (now === detailsOpen) return;
          setDetailsChoice(now);
          writeDetailsChoice(now);
        }}
      >
        <DisclosureSummary className="chapter-details__summary">Chapter details</DisclosureSummary>
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
        {!translating && chapter.translationStatus === 'TRANSLATED' && chapter.translationModel && (
          <p className="muted chapter-details__model">Translated by {chapter.translationModel}</p>
        )}
      </details>

      {!published && !fromText && (
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
          <OriginalPanel
            language={chapter.sourceLanguage}
            text={chapter.sourceText ?? ''}
            activeIndex={activeParagraph}
            footer={
              chapter.sourceFetchedAt && (
                <p className="muted">Fetched from Wattpad {formatInstantWithTime(chapter.sourceFetchedAt)}</p>
              )
            }
          />
        )}
        <div className="field chapter-text">
          <label htmlFor={`${ids}-text`}>Chapter text</label>
          <textarea id={`${ids}-text`} ref={textRef} rows={24} value={text} disabled={locked}
            onChange={(e) => {
              setText(e.target.value);
              trackCaret(e.currentTarget);
            }}
            onSelect={(e) => trackCaret(e.currentTarget)}
            onKeyUp={(e) => trackCaret(e.currentTarget)}
            onClick={(e) => trackCaret(e.currentTarget)} />
        </div>
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
    </Page>
  );
}

/** "· 8/10 paragraphs of the original", red below 90 % (the translation probably lost a part). */
function ParagraphShare({ have, of }: { have: number; of: number }) {
  const short = of > 0 && have < of * MIN_PARAGRAPH_SHARE;
  const label = `· ${have.toLocaleString('en')}/${of.toLocaleString('en')} paragraphs of the original`;
  if (!short) return <span className="chapter-count__share"> {label}</span>;
  return (
    <Tip label="The translation may be missing a part">
      <span className="chapter-count__share chapter-count__warn" tabIndex={0}>
        {' '}
        {label}
      </span>
    </Tip>
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
