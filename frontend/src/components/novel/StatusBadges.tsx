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
 * A chapter's translation and publish state (plus a purple "Fallback model" badge when a fallback model translated it): purple while in progress, orange once published, red when failed.
 * The orange and purple badges carry an icon, so the state does not depend on colour.
 */
export function StatusBadges({
  translation,
  publish,
  model,
  fallback = false,
}: {
  /** Omitted for an original story: it is never translated, so only the publish state shows. */
  translation?: ChapterTranslationStatus;
  publish: ChapterPublishStatus;
  /** The Gemini model(s) that translated it; shown as a tooltip on the Translated badge. */
  model?: string | null;
  /** True when a fallback model translated it: adds a "Fallback model" badge next to Translated. */
  fallback?: boolean;
}) {
  const t = translation ? TRANSLATION[translation] : null;
  const p = PUBLISH[publish];
  return (
    <span className="badges">
      {t === null ? null : translation === 'TRANSLATED' && model ? (
        <Tip label={`Translated by ${model}`}>
          <span className={`badge ${t.tone}`} tabIndex={0}>{content(t)}</span>
        </Tip>
      ) : (
        <span className={`badge ${t.tone}`}>{content(t)}</span>
      )}
      {translation === 'TRANSLATED' && fallback && (
        <Tip label={`Translated by ${model} — re-translate for better quality`}>
          <span className="badge badge--info" tabIndex={0}>Fallback model</span>
        </Tip>
      )}
      <span className={`badge ${p.tone}`}>{content(p)}</span>
    </span>
  );
}
