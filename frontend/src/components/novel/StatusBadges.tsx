import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  FilePen,
  Globe,
  Languages,
  LoaderCircle,
  Replace,
  type LucideIcon,
} from 'lucide-react';
import type { ChapterPublishStatus, ChapterTranslationStatus } from '../../api/novels';
import { Tip } from '../Tip';
import './StatusBadges.css';

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

/** The compact form: one icon per state, so a list row stays on one line (each state has its own shape, not only a colour). */
const COMPACT_TRANSLATION: Record<ChapterTranslationStatus, { icon: LucideIcon; tone: string; spin?: boolean }> = {
  NONE: { icon: CircleDashed, tone: 'muted' },
  TRANSLATING: { icon: LoaderCircle, tone: 'brand-2', spin: true },
  TRANSLATED: { icon: Languages, tone: 'brand-2' },
  FAILED: { icon: CircleAlert, tone: 'failed' },
};

const COMPACT_PUBLISH: Record<ChapterPublishStatus, { icon: LucideIcon; tone: string }> = {
  DRAFT: { icon: FilePen, tone: 'muted' },
  PUBLISHED: { icon: Globe, tone: 'brand' },
};

function StatusIcon({
  icon: Icon,
  tone,
  label,
  spin,
  interactive,
}: {
  icon: LucideIcon;
  tone: string;
  label: string;
  spin?: boolean;
  interactive: boolean;
}) {
  const icon = (
    <span
      className={`status-icon status-icon--${tone}`}
      role="img"
      aria-label={label}
      tabIndex={interactive ? 0 : undefined}
    >
      <Icon className={spin ? 'icon status-icon__spin' : 'icon'} aria-hidden="true" />
    </span>
  );
  return interactive ? <Tip label={label}>{icon}</Tip> : icon;
}

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
  compact = false,
  interactive = true,
}: {
  /** Omitted for an original story: it is never translated, so only the publish state shows. */
  translation?: ChapterTranslationStatus;
  publish: ChapterPublishStatus;
  /** The Gemini model(s) that translated it; shown as a tooltip on the Translated badge. */
  model?: string | null;
  /** True when a fallback model translated it: adds a "Fallback model" badge next to Translated. */
  fallback?: boolean;
  /** Icons only (each with a tooltip and an aria-label), for list rows. */
  compact?: boolean;
  /** Compact only: false drops the tooltips and the tab stops, for icons inside a link or button. */
  interactive?: boolean;
}) {
  if (compact) {
    const t = translation ? COMPACT_TRANSLATION[translation] : null;
    const p = COMPACT_PUBLISH[publish];
    return (
      <span className="badges badges--compact">
        {translation && t && (
          <StatusIcon
            {...t}
            interactive={interactive}
            label={translation === 'TRANSLATED' && model ? `Translated by ${model}` : TRANSLATION[translation].label}
          />
        )}
        {translation === 'TRANSLATED' && fallback && (
          <StatusIcon interactive={interactive} icon={Replace} tone="brand-2" label={`Translated by ${model} — re-translate for better quality`} />
        )}
        <StatusIcon interactive={interactive} {...p} label={PUBLISH[publish].label} />
      </span>
    );
  }
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
