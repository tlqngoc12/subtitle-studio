import type { ChapterPublishStatus, ChapterTranslationStatus } from '../../api/novels';

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
}: {
  translation: ChapterTranslationStatus;
  publish: ChapterPublishStatus;
}) {
  const t = TRANSLATION[translation];
  const p = PUBLISH[publish];
  return (
    <span className="badges">
      <span className={`badge ${t.tone}`}>{t.label}</span>
      <span className={`badge ${p.tone}`}>{p.label}</span>
    </span>
  );
}
