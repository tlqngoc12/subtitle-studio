import { Search } from 'lucide-react';
import { useId, useRef, useState, type MouseEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { chapterLabel } from '../components/novel/ChapterList';
import { ChapterBar, type ChapterMenuItem, type SaveState } from '../components/novel/ChapterBar';
import { FindReplace } from '../components/novel/FindReplace';
import { StatusBadges } from '../components/novel/StatusBadges';
import { ChapterDetails } from '../components/chapter/ChapterDetails';
import { ChapterLightbox } from '../components/chapter/ChapterLightbox';
import { ChapterNav } from '../components/chapter/ChapterNav';
import { ChapterPagesSection, SuspectPagesWarning } from '../components/chapter/ChapterPagesSection';
import { ChapterTextEditor } from '../components/chapter/ChapterTextEditor';
import { Alert } from '../components/ui/Alert';
import { IconButton } from '../components/ui/IconButton';
import { Page } from '../components/ui/Page';
import { PageHeader } from '../components/ui/PageHeader';
import { PageSkeleton } from '../components/ui/Skeleton';
import { useConfirmDialog } from '../components/useConfirmDialog';
import { chapterBusy } from '../lib/novelBusy';
import { useChapterActions } from '../lib/useChapterActions';
import { useChapterEditor } from '../lib/useChapterEditor';
import { useChapterPages } from '../lib/useChapterPages';
import './ChapterPage.css';

export { AUTO_SAVE_MS } from '../lib/useChapterEditor';

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
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [checkSlot, setCheckSlot] = useState<HTMLElement | null>(null);
  const editor = useChapterEditor(chapterId);
  const {
    chapter, text, setText, number, setNumber, label, setLabel, title, setTitle, error, busy, starting,
    finding, setFinding, hits, setHits, counts, originalParagraphs, translating, dirty, canSave,
  } = editor;
  const pages = useChapterPages({
    chapterId, chapter, setChapter: editor.setChapter, setError: editor.setError, run: editor.run, confirm,
  });
  const actions = useChapterActions({
    chapterId, chapter, dirty, load: editor.load, setChapter: editor.setChapter, setStarting: editor.setStarting,
    run: editor.run, confirm, openChapter: (id) => navigate(`/novels/${chapter?.novelId}/chapters/${id}`),
  });

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
  // Published: only its text and title change (Unpublish to do more).
  const published = chapter.publishStatus === 'PUBLISHED';
  // A Wattpad chapter: the original is text on the left, there are no page screenshots.
  const fromText = chapter.sourceText !== null;
  // The Original column is a draft tool: once published, a text chapter looks and behaves like a screenshot chapter.
  const showOriginal = fromText && !published;
  const suspectNumbers = chapter.pages.flatMap((p, i) => (p.suspect ? [i + 1] : []));
  const why = chapterBusy(chapter); // why no translation can start now (null = it can)
  const saveState: SaveState = editor.saving
    ? { kind: 'saving' }
    : dirty ? { kind: 'dirty' } : (editor.lastSave ?? { kind: 'idle' });
  const menuItems: ChapterMenuItem[] = [
    ...(published
      ? [
          {
            label: 'Unpublish',
            // Unpublishing reloads the chapter, so it waits until the edits are saved (like Publish).
            disabled: locked || dirty,
            onSelect: () => void actions.unpublish(),
          },
        ]
      : [
          {
            label: chapter.translationStatus === 'NONE' ? 'Translate' : 'Translate again',
            // Translating again replaces the text, edits included.
            danger: chapter.translationStatus !== 'NONE',
            disabled: locked || (!fromText && chapter.pages.length === 0),
            onSelect: () => void actions.translate(),
          },
        ]),
    ...(showOriginal ? [{ label: 'Reload original', disabled: locked, onSelect: () => void actions.reloadOriginal() }] : []),
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
          <ChapterNav chapter={chapter} chapterPath={chapterPath} onLeave={(e, to) => void leave(e, to)} why={why}
            locked={locked} starting={starting} onStartNext={() => void actions.startNext()} />
        }
        // Short: the H1 above already shows the full title.
        title={chapter.label?.trim() || `Chapter ${chapter.chapterNo}`}
        badges={<StatusBadges translation={chapter.translationStatus} publish={chapter.publishStatus} />}
        saveState={saveState}
        canSave={canSave}
        onSave={() => void editor.save()}
        publish={
          published
            ? undefined
            : {
                onPublish: () => void actions.publish(),
                disabledReason: translating
                  ? 'Wait until this chapter finishes translating.'
                  : busy
                    ? 'Wait until the current action finishes.'
                    : null,
              }
        }
        menuItems={menuItems}
        checkSlotRef={setCheckSlot}
        tools={
          <IconButton label="Find and replace" icon={Search} className="button--ghost" disabled={locked} aria-pressed={finding}
            onClick={() => setFinding((f) => !f)} />
        }
        below={
          finding ? (
            <FindReplace
              text={text}
              onChange={setText}
              textareaRef={textRef}
              onClose={() => setFinding(false)}
              onMatchesChange={(matches, current) => setHits({ matches, current })}
            />
          ) : undefined
        }
      />

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

      <ChapterDetails
        chapter={chapter} idBase={ids} published={published} fromText={fromText} locked={locked} translating={translating}
        number={number} label={label} title={title}
        onNumberChange={setNumber} onLabelChange={setLabel} onTitleChange={setTitle}
        counts={counts} originalParagraphs={originalParagraphs}
      />

      {!published && !fromText && (
        <ChapterPagesSection
          pages={chapter.pages} headingId={`${ids}-pages`} translating={translating} locked={locked}
          uploading={pages.uploading} onFiles={(files) => void pages.upload(files)}
          onRotateAll={(d) => void pages.rotateAll(d)} onRotate={(p, d) => void pages.rotate(p, d)}
          onDelete={(p, n) => void pages.removePage(p, n)} onReorder={(next) => void pages.reorder(next)}
          onEnlarge={pages.setEnlarged}
        />
      )}

      <SuspectPagesWarning numbers={suspectNumbers} onShow={pages.setEnlarged} />

      <ChapterTextEditor
        chapter={chapter} idBase={ids} showOriginal={showOriginal} text={text} onTextChange={setText}
        textRef={textRef} locked={locked} hits={hits} finding={finding} barSlot={checkSlot}
      />

      <ChapterLightbox pages={chapter.pages} index={pages.enlarged} onClose={() => pages.setEnlarged(null)} />
    </Page>
  );
}
