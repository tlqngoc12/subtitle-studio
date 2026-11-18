import { Info } from 'lucide-react';
import { useState } from 'react';
import type { ChapterDetail } from '../../api/novels';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { Tip } from '../Tip';
import { DisclosureSummary } from '../ui/DisclosureSummary';

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

/** Fewer than 90 % of the original's paragraphs. */
function isShortShare(have: number, of: number): boolean {
  return of > 0 && have < of * MIN_PARAGRAPH_SHARE;
}

/** "· 8/10 paragraphs of the original", red below 90 % (the translation probably lost a part). */
function ParagraphShare({ have, of }: { have: number; of: number }) {
  const short = isShortShare(have, of);
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

interface Props {
  chapter: ChapterDetail;
  /** Prefix of the ids of the inputs (they pair with their labels). */
  idBase: string;
  published: boolean;
  fromText: boolean;
  /** An original story: nothing to translate. */
  original?: boolean;
  locked: boolean;
  translating: boolean;
  number: string;
  label: string;
  title: string;
  onNumberChange: (value: string) => void;
  onLabelChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  counts: { words: number; characters: number; paragraphs: number };
  originalParagraphs: number | null;
}

/** The collapsible "Chapter details": number, label, title, the counts and the model that translated it. */
export function ChapterDetails({
  chapter, idBase, published, fromText, original = false, locked, translating,
  number, label, title, onNumberChange, onLabelChange, onTitleChange, counts, originalParagraphs,
}: Props) {
  // The details (number, label, title, translated by) start closed on a phone so the text comes first; the person's
  // own choice is remembered.
  const roomy = useMediaQuery('(min-width: 761px)');
  const [detailsChoice, setDetailsChoice] = useState<boolean | null>(readDetailsChoice);
  const detailsOpen = detailsChoice ?? roomy;

  return (
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
      <DisclosureSummary className="chapter-details__summary">
        Chapter details
        {originalParagraphs !== null && isShortShare(counts.paragraphs, originalParagraphs) && (
          // Shown only while the details are closed (CSS), so the warning is not hidden with them.
          <Tip label="The translation may be missing a part">
            <span className="chapter-count__warn chapter-details__warn" tabIndex={0}>
              {counts.paragraphs.toLocaleString('en')}/{originalParagraphs.toLocaleString('en')} paragraphs
            </span>
          </Tip>
        )}
      </DisclosureSummary>
      {published && (
        <p className="chapter-note muted">
          {original
            ? 'This chapter is published: only the text, label and title can be edited. Unpublish to change its number.'
            : `This chapter is published: only the text, label and title can be edited. ${
                fromText ? 'Unpublish to translate again.' : 'Unpublish to change pages or translate again.'
              }`}
        </p>
      )}
      <div className="chapter-meta">
      <div className="chapter-meta__row">
        {!published && (
          <div className="field chapter-meta__number">
            <div className="field__label-row">
              <label htmlFor={`${idBase}-no`}>Number</label>
              <Tip label="The chapter's link number. Drag chapters in the list to change the reading order.">
                <button className="info-icon" type="button" aria-label="About Number">
                  <Info className="icon" aria-hidden="true" />
                </button>
              </Tip>
            </div>
            <input id={`${idBase}-no`} type="text" inputMode="numeric" value={number} disabled={locked}
              onChange={(e) => onNumberChange(e.target.value.replace(/\D/g, ''))} />
          </div>
        )}
        <div className="field chapter-meta__label">
          <div className="field__label-row">
            <label htmlFor={`${idBase}-label`}>Chapter label (optional)</label>
            <Tip label="Shown instead of the number, e.g. Ngoại truyện 1, Special.">
              <button className="info-icon" type="button" aria-label="About Chapter label">
                <Info className="icon" aria-hidden="true" />
              </button>
            </Tip>
          </div>
          <input id={`${idBase}-label`} type="text" maxLength={100} value={label} disabled={locked}
            placeholder="e.g. Ngoại truyện 1"
            onChange={(e) => onLabelChange(e.target.value)} />
        </div>
        <div className="field chapter-meta__title">
          <label htmlFor={`${idBase}-title`}>Chapter title (optional)</label>
          <input id={`${idBase}-title`} type="text" maxLength={200} value={title} disabled={locked}
            onChange={(e) => onTitleChange(e.target.value)} />
        </div>
      </div>
      </div>
      <div className="chapter-details__meta">
        <p className="chapter-count muted">
          {plural(counts.words, 'word')} · {plural(counts.characters, 'character')} · {plural(counts.paragraphs, 'paragraph')}
          {originalParagraphs !== null && <ParagraphShare have={counts.paragraphs} of={originalParagraphs} />}
        </p>
        {!translating && chapter.translationStatus === 'TRANSLATED' && chapter.translationModel && (
          <p className="muted chapter-details__model">Translated by {chapter.translationModel}{chapter.translatedByFallback ? ' (fallback model)' : ''}</p>
        )}
      </div>
    </details>
  );
}
