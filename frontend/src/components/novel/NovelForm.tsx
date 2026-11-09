import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError, type FieldError } from '../../api/client';
import { getNovelProfiles, type NovelDetail, type NovelInput, type NovelStatus } from '../../api/novels';
import { errorMessage, type ErrorMessage } from '../../lib/errors';
import { ImagePicker, type PickedImage } from '../profile/ImagePicker';
import { Alert } from '../ui/Alert';

/** "Tình Yêu Mùa Hạ" → "tinh-yeu-mua-ha": no accents, lowercase, single hyphens. */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function blankToNull(value: string): string | null {
  const t = value.trim();
  return t ? t : null;
}

/** The eight novel fields plus slug and translation profile (create and edit). */
export function NovelForm({
  initial,
  onSubmit,
  submitLabel,
  pendingLabel,
}: {
  initial?: NovelDetail;
  onSubmit: (input: NovelInput) => Promise<void>;
  submitLabel: string;
  pendingLabel: string;
}) {
  const ids = useId();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [slugEdited, setSlugEdited] = useState(Boolean(initial));
  const [cover, setCover] = useState<PickedImage | null>(
    initial?.coverMediaId && initial.coverUrl ? { mediaId: initial.coverMediaId, mediaUrl: initial.coverUrl } : null,
  );
  const [coverBusy, setCoverBusy] = useState(false);
  const [author, setAuthor] = useState(initial?.originalAuthor ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [tags, setTags] = useState(initial?.tags.join(', ') ?? '');
  const [status, setStatus] = useState<NovelStatus>(initial?.novelStatus ?? 'ONGOING');
  const [credit, setCredit] = useState(initial?.translatorCredit ?? '');
  const [sourceUrl, setSourceUrl] = useState(initial?.sourceUrl ?? '');
  const [profile, setProfile] = useState(initial?.promptProfile ?? '');
  const [profiles, setProfiles] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);

  useEffect(() => {
    getNovelProfiles()
      .then((p) => setProfiles(p.profiles))
      .catch(() => setProfiles([]));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors([]);
    try {
      await onSubmit({
        slug: slug.trim(),
        title: title.trim(),
        coverMediaId: cover?.mediaId ?? null,
        originalAuthor: blankToNull(author),
        description: blankToNull(description),
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        novelStatus: status,
        translatorCredit: blankToNull(credit),
        sourceUrl: blankToNull(sourceUrl),
        promptProfile: blankToNull(profile),
      });
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError) setFieldErrors(err.fieldErrors);
    } finally {
      setPending(false);
    }
  }

  const fieldError = (field: string) => fieldErrors.find((f) => f.field === field)?.message;

  /**
   * A labelled input with its hint or error wired to aria-describedby. A plain function, not a component, so the
   * inputs keep their focus while typing.
   */
  function renderField({ name, label, hint, children }: {
    name: string;
    label: string;
    hint?: string;
    children: (a: { id: string; invalid: boolean | undefined; describedBy: string | undefined }) => ReactNode;
  }) {
    const id = `${ids}-${name}`;
    const message = fieldError(name);
    const describedBy = message ? `${id}-error` : hint ? `${id}-hint` : undefined;
    return (
      <div className="field">
        <label htmlFor={id}>{label}</label>
        {children({ id, invalid: message ? true : undefined, describedBy })}
        {hint && !message && (
          <p className="field__hint" id={`${id}-hint`}>
            {hint}
          </p>
        )}
        {message && (
          <p className="field__error" id={`${id}-error`}>
            {message}
          </p>
        )}
      </div>
    );
  }

  return (
    <form className="novel-form" onSubmit={submit} aria-busy={pending} noValidate>
      {renderField({
        name: 'title',
        label: 'Title',
        children: (a) => (
          <input
            id={a.id}
            type="text"
            autoComplete="off"
            maxLength={200}
            required
            value={title}
            aria-invalid={a.invalid}
            aria-describedby={a.describedBy}
            onChange={(e) => {
              setTitle(e.target.value);
              if (!slugEdited) setSlug(slugify(e.target.value));
            }}
          />
        ),
      })}
      {renderField({
        name: 'slug',
        label: 'Slug',
        hint: 'Used in the public link: /novels/your-slug',
        children: (a) => (
          <input
            id={a.id}
            type="text"
            autoComplete="off"
            maxLength={60}
            value={slug}
            aria-invalid={a.invalid}
            aria-describedby={a.describedBy}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugEdited(true);
            }}
          />
        ),
      })}
      <div className="field">
        <span className="field__label">Cover (optional)</span>
        <ImagePicker
          value={cover}
          onChange={setCover}
          onBusyChange={setCoverBusy}
          invalid={Boolean(fieldError('coverMediaId'))}
        />
        {fieldError('coverMediaId') && <p className="field__error">{fieldError('coverMediaId')}</p>}
      </div>
      {renderField({
        name: 'originalAuthor',
        label: 'Original author (optional)',
        children: (a) => (
          <input id={a.id} type="text" maxLength={200} value={author} aria-invalid={a.invalid}
            aria-describedby={a.describedBy} onChange={(e) => setAuthor(e.target.value)} />
        ),
      })}
      {renderField({
        name: 'description',
        label: 'Description (optional)',
        children: (a) => (
          <textarea id={a.id} rows={5} maxLength={5000} value={description} aria-invalid={a.invalid}
            aria-describedby={a.describedBy} onChange={(e) => setDescription(e.target.value)} />
        ),
      })}
      {renderField({
        name: 'tags',
        label: 'Tags (optional)',
        hint: 'Separate tags with commas, at most 10.',
        children: (a) => (
          <input id={a.id} type="text" value={tags} aria-invalid={a.invalid} aria-describedby={a.describedBy}
            onChange={(e) => setTags(e.target.value)} />
        ),
      })}
      {renderField({
        name: 'novelStatus',
        label: 'Status',
        children: (a) => (
          <select id={a.id} value={status} aria-invalid={a.invalid} aria-describedby={a.describedBy}
            onChange={(e) => setStatus(e.target.value as NovelStatus)}>
            <option value="ONGOING">Ongoing</option>
            <option value="COMPLETED">Completed</option>
          </select>
        ),
      })}
      {renderField({
        name: 'translatorCredit',
        label: 'Translator credit (optional)',
        children: (a) => (
          <input id={a.id} type="text" maxLength={200} placeholder="Dịch: @yourname" value={credit}
            aria-invalid={a.invalid} aria-describedby={a.describedBy} onChange={(e) => setCredit(e.target.value)} />
        ),
      })}
      {renderField({
        name: 'sourceUrl',
        label: 'Original book link (optional)',
        children: (a) => (
          <input id={a.id} type="text" inputMode="url" maxLength={1000} placeholder="https://…" value={sourceUrl}
            aria-invalid={a.invalid} aria-describedby={a.describedBy} onChange={(e) => setSourceUrl(e.target.value)} />
        ),
      })}
      {renderField({
        name: 'promptProfile',
        label: 'Translation profile',
        hint: 'A .md file in ./data/prompts/novels: source language, names, how characters address each other.',
        children: (a) => (
          <select id={a.id} value={profile} aria-invalid={a.invalid} aria-describedby={a.describedBy}
            onChange={(e) => setProfile(e.target.value)}>
            <option value="">None (Translate is off)</option>
            {profiles.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            {profile && !profiles.includes(profile) && <option value={profile}>{profile}</option>}
          </select>
        ),
      })}
      {error && (
        <Alert title={error.title} hint={error.hint} />
      )}
      <button className="button button--primary" type="submit" disabled={pending || coverBusy || !title.trim()}>
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
