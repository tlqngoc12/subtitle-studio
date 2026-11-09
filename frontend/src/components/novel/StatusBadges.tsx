import type { ChapterPublishStatus, ChapterTranslationStatus } from '../../api/novels';
import { Tip } from '../Tip';

const TRANSLATION: Record<ChapterTranslationStatus, { label: string; tone: string }> = {
  NONE: { label: 'Not translated', tone: 'badge--muted' },
  TRANSLATING: { label: 'Translating…', tone: 'badge--progress' },
  TRANSLATED: { label: 'Translated', tone: 'badge--info' },
  FAILED: { label: 'Failed', tone: 'badge--failed' },
};

const PUBLISH: Record<ChapterPublishStatus, { label: string; tone: string }> = {
  DRAFT: { label: 'Draft', tone: 'badge--draft' },
  PUBLISHED: { label: 'Published', tone: 'badge--done' },
};

/** A chapter's translation and publish state: purple while in progress, orange once published, red when failed. */
export function StatusBadges({
  translation,
  publish,
  model,
}: {
  translation: ChapterTranslationStatus;
  publish: ChapterPublishStatus;
  /** The Gemini model(s) that translated it; shown as a tooltip on the Translated badge. */
  model?: string | null;
}) {
  const t = TRANSLATION[translation];
  const p = PUBLISH[publish];
  return (
    <span className="badges">
      {translation === 'TRANSLATED' && model ? (
        <Tip label={`Translated by ${model}`}>
          <span className={`badge ${t.tone}`} tabIndex={0}>{t.label}</span>
        </Tip>
      ) : (
        <span className={`badge ${t.tone}`}>{t.label}</span>
      )}
      <span className={`badge ${p.tone}`}>{p.label}</span>
    </span>
  );
}
