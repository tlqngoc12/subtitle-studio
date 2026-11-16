import { useState, type RefObject } from 'react';
import type { ChapterDetail } from '../../api/novels';
import { paragraphIndexAt } from '../../lib/chapterText';
import { formatInstantWithTime } from '../../lib/dates';
import type { FindHits } from '../../lib/useChapterEditor';
import { useAutoGrow } from '../../lib/useAutoGrow';
import { FindHighlights } from '../novel/FindHighlights';
import { OriginalPanel } from '../novel/OriginalPanel';

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
  // The paragraph the caret is in (matched with the original's paragraph of the same number).
  const [activeParagraph, setActiveParagraph] = useState<number | null>(null);
  function trackCaret(el: HTMLTextAreaElement) {
    if (chapter.sourceText == null) return; // only a chapter with an original has paragraphs to match
    setActiveParagraph(paragraphIndexAt(el.value, el.selectionStart));
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
        <label htmlFor={`${idBase}-text`}>Chapter text</label>
        <div className={showHits ? 'chapter-text__box chapter-text__box--finding' : 'chapter-text__box'}>
          {showHits && <FindHighlights text={text} matches={hits.matches} current={hits.current} textareaRef={textRef} />}
          <textarea id={`${idBase}-text`} ref={textRef} rows={24} value={text} disabled={locked}
            className={showHits ? 'chapter-text--finding' : undefined}
            onChange={(e) => {
              onTextChange(e.target.value);
              trackCaret(e.currentTarget);
            }}
            onSelect={(e) => trackCaret(e.currentTarget)}
            onKeyUp={(e) => trackCaret(e.currentTarget)}
            onClick={(e) => trackCaret(e.currentTarget)} />
        </div>
      </div>
    </div>
  );
}
