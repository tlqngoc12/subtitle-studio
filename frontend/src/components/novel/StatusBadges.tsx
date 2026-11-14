import { CircleCheck, LoaderCircle, type LucideIcon } from 'lucide-react';
import type { ChapterPublishStatus, ChapterTranslationStatus } from '../../api/novels';
import { Tip } from '../Tip';

type Badge = { label: string; tone: string; icon?: LucideIcon };

const TRANSLATION: Record<ChapterTranslationStatus, Badge> = {
  NONE: { label: 'Not translated', tone: 'badge--muted' },
  TRANSLATING: { label: 'Translating…', tone: 'badge--progress', icon: LoaderCircle },
  TRANSLATED: { label: 'Translated', tone: 'badge--info' },
  FAILED: { label: 'Failed', tone: 'badge--failed' },
};

const PUBLISH: Record<ChapterPublishStatus, Badge> = {
  DRAFT: { label: 'Draft', tone: 'badge--draft' },
  PUBLISHED: { label: 'Published', tone: 'badge--done', icon: CircleCheck },
};

function content({ icon: Icon, label }: Badge) {
  return (
    <>
      {Icon && <Icon className="icon icon--sm" aria-hidden="true" />}
      {label}
    </>
  );
}

/**
 * A chapter's translation and publish state: purple while in progress, orange once published, red when failed.
 * The orange and purple badges carry an icon, so the state does not depend on colour.
 */
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
          <span className={`badge ${t.tone}`} tabIndex={0}>{content(t)}</span>
        </Tip>
      ) : (
        <span className={`badge ${t.tone}`}>{content(t)}</span>
      )}
      <span className={`badge ${p.tone}`}>{content(p)}</span>
    </span>
  );
}
