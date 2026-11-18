import { ListPlus } from 'lucide-react';
import { useRef, useState, type RefObject } from 'react';
import type { ChapterDetail } from '../../api/novels';
import { alignParagraph, paragraphIndexAt, paragraphs } from '../../lib/chapterText';
import { formatInstantWithTime } from '../../lib/dates';
import type { FindHits } from '../../lib/useChapterEditor';
import { useAutoGrow } from '../../lib/useAutoGrow';
import { AddCheckRuleDialog, ruleSelectionProblem } from './AddCheckRuleDialog';
import { CheckPopover } from './CheckPopover';
import { CheckToggle } from './CheckToggle';
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
}

/** The chapter's text box, with the original beside it for a chapter that has one. */
export function ChapterTextEditor({ chapter, idBase, showOriginal, text, onTextChange, textRef, locked, hits, finding }: Props) {
  useAutoGrow(textRef, text);
  const showHits = finding && hits.matches.length > 0;
  const check = useChapterCheck({ novelId: chapter.novelId, text, locked, textRef, onTextChange });
  const checkBox = useRef<HTMLDivElement>(null);
  const layered = showHits || check.on; // the marks sit behind a see-through textarea
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
        <div className={layered ? 'chapter-text__box chapter-text__box--finding' : 'chapter-text__box'}>
          <CopyTextButton label="Copy chapter text" text={text} />
          {showHits && <FindHighlights text={text} matches={hits.matches} current={hits.current} textareaRef={textRef} />}
          {check.on && <CheckHighlights text={text} marks={check.marks} textareaRef={textRef} boxRef={checkBox} />}
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
          onClose={check.close}
        />
      </div>
    </div>
  );
}
