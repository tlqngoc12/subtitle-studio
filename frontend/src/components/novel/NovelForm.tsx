import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError, type FieldError } from '../../api/client';
import { Link } from 'react-router';
import { Trash2 } from 'lucide-react';
import {
  getNovelProfiles,
  listNovels,
  type NovelDetail,
  type NovelInput,
  type NovelStatus,
  type SourceLanguage,
  type WattpadNovelPreview,
} from '../../api/novels';
import { errorMessage, type ErrorMessage } from '../../lib/errors';
import { ImageDropzone, previewOf, toPicked, type PickedImage } from '../ui/ImageDropzone';
import { Alert } from '../ui/Alert';
import { Select } from '../ui/Select';
import { TagInput } from '../ui/TagInput';
import { Tip } from '../Tip';
import './NovelForm.css';
import { FormActions } from '../ui/FormActions';

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

/** The link the form shows for a stored trailer id. */
export function trailerLink(videoId: string | null | undefined): string {
  return videoId ? `https://youtu.be/${videoId}` : '';
}

/** Wattpad tags that fit the form's limits (at most 10 tags of 40 characters, no commas). */
function prefillTags(tags: string[]): string[] {
  return tags
    .map((t) => t.replace(/,/g, ' ').trim())
    .filter((t) => t && t.length <= 40)
    .slice(0, 10);
}

function blankToNull(value: string): string | null {
  const t = value.trim();
  return t ? t : null;
}

/**
 * The eight novel fields plus slug and translation profile (create and edit). `wattpad` prefills a new novel from a
 * Wattpad story and adds the Source language field; an existing Wattpad novel shows that field too.
 */
export function NovelForm({
  initial,
  wattpad,
  onSubmit,
  submitLabel,
  pendingLabel,
  onDelete,
  cancelTo,
}: {
  initial?: NovelDetail;
  wattpad?: WattpadNovelPreview;
  onSubmit: (input: NovelInput) => Promise<void>;
  submitLabel: string;
  pendingLabel: string;
  /** Edit: a Delete novel button at the left of the sticky bar. */
  onDelete?: () => void;
  /** Create: a Cancel link back to this path, left of the submit button. */
  cancelTo?: string;
}) {
  const ids = useId();
  const [title, setTitle] = useState(initial?.title ?? wattpad?.title ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? slugify(wattpad?.title ?? ''));
  const [slugEdited, setSlugEdited] = useState(Boolean(initial));
  const [cover, setCover] = useState<PickedImage | null>(
    initial?.coverMediaId && initial.coverUrl ? { mediaId: initial.coverMediaId, mediaUrl: initial.coverUrl } : null,
  );
  const [coverBusy, setCoverBusy] = useState(false);
  const [author, setAuthor] = useState(initial?.originalAuthor ?? wattpad?.author ?? '');
  const [description, setDescription] = useState(initial?.description ?? wattpad?.description?.slice(0, 5000) ?? '');
  const [tags, setTags] = useState<string[]>(initial ? initial.tags : prefillTags(wattpad?.tags ?? []));
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [titleMissing, setTitleMissing] = useState(false);
  const [status, setStatus] = useState<NovelStatus>(
    initial?.novelStatus ?? (wattpad?.completed ? 'COMPLETED' : 'ONGOING'),
  );
  const fromWattpad = Boolean(wattpad) || initial?.sourceType === 'WATTPAD';
  const [sourceLanguage, setSourceLanguage] = useState<SourceLanguage>(
    initial?.sourceLanguage ?? wattpad?.sourceLanguage ?? 'th',
  );
  const [credit, setCredit] = useState(initial?.translatorCredit ?? '');
  const [sourceUrl, setSourceUrl] = useState(initial?.sourceUrl ?? wattpad?.storyUrl ?? '');
  const [trailer, setTrailer] = useState(trailerLink(initial?.trailerVideoId));
  const [profile, setProfile] = useState(initial?.promptProfile ?? '');
  const [profiles, setProfiles] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);

  // After a save the server's value wins: whatever form of the link was pasted, it shows as https://youtu.be/<id>.
  const storedTrailer = initial?.trailerVideoId;
  useEffect(() => setTrailer(trailerLink(storedTrailer)), [storedTrailer]);

  useEffect(() => {
    getNovelProfiles()
      .then((p) => setProfiles(p.profiles))
      .catch(() => setProfiles([]));
  }, []);

  // Suggest the tags the other novels already use (the list is a convenience: a failure just means no suggestions).
  useEffect(() => {
    listNovels()
      .then((novels) => {
        const seen = new Map<string, string>();
        for (const n of novels) for (const t of n.tags) if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
        setTagSuggestions([...seen.values()].sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => setTagSuggestions([]));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setTitleMissing(true);
      return;
    }
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
        tags,
        novelStatus: status,
        translatorCredit: blankToNull(credit),
        sourceUrl: blankToNull(sourceUrl),
        promptProfile: blankToNull(profile),
        trailerUrl: blankToNull(trailer),
        ...(fromWattpad ? { sourceLanguage } : {}),
        ...(wattpad
          ? {
              sourceType: 'WATTPAD' as const,
              wattpadStoryId: wattpad.storyId,
              // The story's own cover is downloaded by the server unless a cover was added here.
              coverUrl: cover ? null : wattpad.coverUrl,
            }
          : {}),
      });
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError) setFieldErrors(err.fieldErrors);
    } finally {
      setPending(false);
    }
  }

  const fieldError = (field: string) =>
    (field === 'title' && titleMissing && !title.trim() ? 'Title is required.' : undefined) ??
    fieldErrors.find((f) => f.field === field)?.message;

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

  const hasTitle = Boolean(title.trim());

  return (
    <form className="novel-form" onSubmit={submit} aria-busy={pending} noValidate>
      <section className="form-section" aria-labelledby={`${ids}-basics`}>
        <h2 className="form-section__title" id={`${ids}-basics`}>
          Basics
        </h2>
        <div className="novel-form__basics">
          <div className="field novel-form__cover">
            <span className="field__label">Cover (optional)</span>
            <ImageDropzone
              label="Cover image"
              value={previewOf(cover)}
              aspect="3/4"
              maxSide={null}
              onUploaded={(media) => setCover(toPicked(media))}
              onRemove={() => setCover(null)}
              onBusyChange={setCoverBusy}
              invalid={Boolean(fieldError('coverMediaId'))}
            />
            {wattpad?.coverUrl && !cover && (
              <div className="novel-form__wattpad-cover">
                <img src={wattpad.coverUrl} alt="Cover from Wattpad" width={96} />
                <p className="field__hint">The cover from Wattpad is used unless you add one.</p>
              </div>
            )}
            {fieldError('coverMediaId') && <p className="field__error">{fieldError('coverMediaId')}</p>}
          </div>
          <div className="novel-form__basics-fields">
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
            {renderField({
              name: 'originalAuthor',
              label: 'Original author (optional)',
              children: (a) => (
                <input id={a.id} type="text" maxLength={200} value={author} aria-invalid={a.invalid}
                  aria-describedby={a.describedBy} onChange={(e) => setAuthor(e.target.value)} />
              ),
            })}
            {renderField({
              name: 'novelStatus',
              label: 'Status',
              children: (a) => (
                <Select id={a.id} value={status} aria-invalid={a.invalid} aria-describedby={a.describedBy}
                  onChange={(v) => setStatus(v as NovelStatus)}
                  options={[{ value: 'ONGOING', label: 'Ongoing' }, { value: 'COMPLETED', label: 'Completed' }]} />
              ),
            })}
          </div>
        </div>
      </section>

      <section className="form-section" aria-labelledby={`${ids}-about`}>
        <h2 className="form-section__title" id={`${ids}-about`}>
          About
        </h2>
        {renderField({
          name: 'description',
          label: 'Description (optional)',
          hint: `${description.length} / 5000`,
          children: (a) => (
            <textarea id={a.id} rows={8} maxLength={5000} value={description} aria-invalid={a.invalid}
              aria-describedby={a.describedBy} onChange={(e) => setDescription(e.target.value)} />
          ),
        })}
        {renderField({
          name: 'tags',
          label: 'Tags (optional)',
          hint: 'Press Enter or comma after each tag.',
          children: (a) => (
            <TagInput id={a.id} value={tags} onChange={setTags} suggestions={tagSuggestions}
              aria-invalid={a.invalid} aria-describedby={a.describedBy} />
          ),
        })}
      </section>

      <section className="form-section" aria-labelledby={`${ids}-links`}>
        <h2 className="form-section__title" id={`${ids}-links`}>
          Links
        </h2>
        {renderField({
          name: 'sourceUrl',
          label: 'Original book link (optional)',
          children: (a) => (
            <input id={a.id} type="text" inputMode="url" maxLength={1000} placeholder="https://…" value={sourceUrl}
              aria-invalid={a.invalid} aria-describedby={a.describedBy} onChange={(e) => setSourceUrl(e.target.value)} />
          ),
        })}
        {renderField({
          name: 'trailerUrl',
          label: 'Trailer (YouTube link, optional)',
          hint: 'Shown as a Trailer tab on the public novel page.',
          children: (a) => (
            <input id={a.id} type="text" inputMode="url" maxLength={1000} placeholder="https://youtu.be/…" value={trailer}
              aria-invalid={a.invalid} aria-describedby={a.describedBy} onChange={(e) => setTrailer(e.target.value)} />
          ),
        })}
      </section>

      <section className="form-section" aria-labelledby={`${ids}-translation`}>
        <h2 className="form-section__title" id={`${ids}-translation`}>
          Translation
        </h2>
        {fromWattpad &&
          renderField({
            name: 'sourceLanguage',
            label: 'Source language',
            hint: 'The language of the Wattpad text that Gemini translates.',
            children: (a) => (
              <Select id={a.id} value={sourceLanguage} aria-invalid={a.invalid} aria-describedby={a.describedBy}
                onChange={(v) => setSourceLanguage(v as SourceLanguage)}
                options={[{ value: 'th', label: 'Thai' }, { value: 'en', label: 'English' },
                  { value: 'es', label: 'Spanish' }]} />
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
          name: 'promptProfile',
          label: 'Translation profile (optional)',
          hint: wattpad && !initial && !profile
            ? `Leave empty to create ${wattpad.suggestedProfile}.md from the Wattpad details.`
            : 'A .md file in ./data/prompts/novels: source language, names, how characters address each other.',
          children: (a) => (
            <Select id={a.id} value={profile} aria-invalid={a.invalid} aria-describedby={a.describedBy}
              onChange={setProfile}
              options={[
                { value: '', label: 'None (Translate is off)' },
                ...profiles.map((p) => ({ value: p, label: p })),
                ...(profile && !profiles.includes(profile) ? [{ value: profile, label: profile }] : []),
              ]} />
          ),
        })}
      </section>

      {error && (
        <Alert title={error.title} hint={error.hint} />
      )}
      <FormActions
        sticky
        start={
          onDelete && (
            <Tip label="Delete novel">
              <button type="button" className="button button--danger" onClick={onDelete}>
                <Trash2 className="icon" aria-hidden="true" />
                <span className="form-actions__label">Delete novel</span>
              </button>
            </Tip>
          )
        }
      >
        {cancelTo && (
          <Link className="button" to={cancelTo}>
            Cancel
          </Link>
        )}
        <Tip label="Title is required" disabled={hasTitle}>
          <span className="novel-form__submit">
            <button className="button button--primary" type="submit" disabled={pending || coverBusy || !hasTitle}>
              {pending ? pendingLabel : submitLabel}
            </button>
          </span>
        </Tip>
      </FormActions>
    </form>
  );
}
