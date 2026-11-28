import { Columns2, ListPlus } from 'lucide-react';
import { useRef, useState, type RefObject } from 'react';
import type { ChapterDetail } from '../../api/novels';
import { alignParagraph, paragraphIndexAt, paragraphs } from '../../lib/chapterText';
import { formatInstantWithTime } from '../../lib/dates';
import type { FindHits } from '../../lib/useChapterEditor';
import { useAutoGrow } from '../../lib/useAutoGrow';
import { AddCheckRuleDialog, ruleSelectionProblem } from './AddCheckRuleDialog';
import { CheckPopover } from './CheckPopover';
import { createPortal } from 'react-dom';
import { CheckNavigator, CheckToggle } from './CheckToggle';
import { ReviewToggle } from './ReviewToggle';
import { Alert } from '../ui/Alert';
import { CopyTextButton } from './CopyTextButton';
import { useChapterCheck } from './useChapterCheck';
import { CheckHighlights } from '../novel/CheckHighlights';
import { FindHighlights } from '../novel/FindHighlights';
import { OriginalPanel } from '../novel/OriginalPanel';
import { Tip } from '../Tip';

interface Props {
  chapter: ChapterDetail;
  /** Prefix of the textarea id (it pairs with its label). */
  idBase: string;
  showOriginal: boolean;
  text: string;
  onTextChange: (text: string) => void;
  textRef: RefObject<HTMLTextAreaElement | null>;
  locked: boolean;
  /** The matches of the open find panel; painted behind the textarea. */
  hits: FindHits;
  finding: boolean;
  /** The slot in the sticky chapter bar where the Check navigator is shown while Check is on. */
  barSlot?: HTMLElement | null;
  /** A published text chapter: the button that shows or hides its original (read-only). Absent when the original is always shown (a draft). */
  originalToggle?: { shown: boolean; onToggle: () => void };
}

/** The chapter's text box, with the original beside it for a chapter that has one. */
export function ChapterTextEditor({ chapter, idBase, showOriginal, text, onTextChange, textRef, locked, hits, finding, barSlot, originalToggle }: Props) {
  useAutoGrow(textRef, text);
  const showHits = finding && hits.matches.length > 0;
  const checkBox = useRef<HTMLDivElement>(null);
  const isOriginal = chapter.sourceType === 'ORIGINAL';
  const check = useChapterCheck({ novelId: chapter.novelId, chapterId: chapter.id, original: isOriginal, text, locked, textRef, boxRef: checkBox, onTextChange });
  const layered = showHits || check.marking; // the marks sit behind a see-through textarea
  const [showMissing, setShowMissing] = useState(false);
  const current = check.current;
  // Only Review says how many places a passage stands; Check popovers stay as they were.
  const ruleMatches =
    check.mode === 'review' && current && current.kind === 'rule'
      ? check.issues.filter((i) => i.kind === 'rule' && i.rule === current.rule).length
      : 1;
  // The paragraph the caret is in (matched with the original's paragraph of the same number).
  const [activeParagraph, setActiveParagraph] = useState<number | null>(null);
  // The selected text (kept after the textarea loses focus, so the "Add to check rules" button still sees it).
  const [selection, setSelection] = useState('');
  const [ruleOpen, setRuleOpen] = useState(false);
  const ruleProblem = ruleSelectionProblem(selection, { hasProfile: check.hasProfile, locked });
  function trackCaret(el: HTMLTextAreaElement) {
    setSelection(el.value.slice(el.selectionStart, el.selectionEnd));
    if (chapter.sourceText == null) return; // only a chapter with an original has paragraphs to match
    // Image markers are anchors: the paragraphs the translator wrote about an image belong to that image.
    setActiveParagraph(
      alignParagraph(paragraphs(chapter.sourceText), paragraphs(el.value), paragraphIndexAt(el.value, el.selectionStart)),
    );
  }

  return (
    <div className={showOriginal ? 'chapter-columns' : undefined}>
      {check.marking && barSlot && createPortal(
        <CheckNavigator label={check.mode === 'review' ? 'Review' : 'Check'} count={check.issues.length} onPrev={() => check.goTo(-1)} onNext={() => check.goTo(1)} />,
        barSlot,
      )}
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
        <div className="chapter-text__head">
          <label htmlFor={`${idBase}-text`}>Chapter text</label>
          <div className="chapter-text__tools">
            <Tip label={ruleProblem ?? ''} disabled={ruleProblem === null}>
              <button
                type="button"
                className="button button--s"
                aria-disabled={ruleProblem !== null || undefined}
                onClick={() => ruleProblem === null && setRuleOpen(true)}
              >
                <ListPlus className="icon" aria-hidden="true" />
                Add to check rules
              </button>
            </Tip>
            {originalToggle && (
              <button
                type="button"
                className="button button--s check-toggle"
                aria-pressed={originalToggle.shown}
                onClick={originalToggle.onToggle}
              >
                <Columns2 className="icon" aria-hidden="true" />
                Show original
              </button>
            )}
            {isOriginal && (
              <ReviewToggle
                on={check.review.on}
                count={check.issues.length}
                loading={check.review.loading}
                disabled={locked}
                onToggle={() => void check.toggleReview()}
              />
            )}
            <CheckToggle
              on={check.on}
              count={check.issues.length}
              disabledReason={check.disabledReason}
              ignored={check.ignored}
              onToggle={() => void check.toggle()}
              onPrev={() => check.goTo(-1)}
              onNext={() => check.goTo(1)}
            />
          </div>
        </div>
        {isOriginal && chapter.sourceFetchedAt && (
          <p className="muted">Synced from Wattpad {formatInstantWithTime(chapter.sourceFetchedAt)}</p>
        )}
        {check.review.error && <Alert title={check.review.error} />}
        {check.review.on && (
          <div className="review-summary">
            <p className="muted review-summary__line">
              {check.review.fileName} · {check.issues.length} to fix · {check.review.done} done ·{' '}
              {check.review.notFound.length > 0 ? (
                <button type="button" className="review-summary__toggle" aria-expanded={showMissing} onClick={() => setShowMissing((v) => !v)}>
                  {check.review.notFound.length} not found
                </button>
              ) : (
                '0 not found'
              )}
            </p>
            {showMissing && check.review.notFound.length > 0 && (
              <ul className="review-summary__missing">
                {check.review.notFound.map((r, i) => (
                  <li key={`${r.item}-${i}`}>
                    {r.item} — {r.old.length > 60 ? `${r.old.slice(0, 60)}…` : r.old}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className={layered ? 'chapter-text__box chapter-text__box--finding' : 'chapter-text__box'}>
          <CopyTextButton label="Copy chapter text" text={text} />
          {showHits && <FindHighlights text={text} matches={hits.matches} current={hits.current} textareaRef={textRef} />}
          {check.marking && <CheckHighlights text={text} marks={check.marks} textareaRef={textRef} boxRef={checkBox} />}
          <textarea id={`${idBase}-text`} ref={textRef} rows={24} value={text} disabled={locked}
            className={layered ? 'chapter-text--finding' : undefined}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && check.current) {
                e.preventDefault();
                check.close();
              } else if (e.key === 'Tab' && !e.shiftKey && check.current) {
                // Focus stays in the text while typing; Tab goes to the suggestions when there are some.
                const chip = document.querySelector<HTMLElement>('.check-popover .check-chip');
                if (chip) {
                  e.preventDefault();
                  chip.focus();
                }
              }
            }}
            onChange={(e) => {
              onTextChange(e.target.value);
              trackCaret(e.currentTarget);
            }}
            onSelect={(e) => trackCaret(e.currentTarget)}
            onKeyUp={(e) => trackCaret(e.currentTarget)}
            onClick={(e) => trackCaret(e.currentTarget)} />
        </div>
        <AddCheckRuleDialog
          open={ruleOpen}
          onOpenChange={setRuleOpen}
          novelId={chapter.novelId}
          selection={selection}
          onAdded={() => void check.reloadRules()}
        />
        <CheckPopover
          issue={check.current}
          matched={check.current ? text.slice(check.current.start, check.current.end) : ''}
          anchor={() => checkBox.current?.querySelector<HTMLElement>(`[data-index="${check.currentIndex}"]`) ?? null}
          onApply={check.apply}
          onStep={check.goToInGroup}
          onClose={check.close}
          exact={check.mode === 'review'}
          matches={ruleMatches}
        />
      </div>
    </div>
  );
}
