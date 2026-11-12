import * as Dialog from '@radix-ui/react-dialog';
import { Download, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, type FieldError } from '../../api/client';
import {
  createPhoto,
  fetchFromX,
  isXStatusUrl,
  updatePhoto,
  type PhotoPost,
  type PhotoPostInput,
  type PhotoSource,
} from '../../api/photos';
import { errorMessage, type ErrorMessage } from '../../lib/errors';
import { toIsoDay, DatePicker } from '../ui/DatePicker';
import { Field } from '../ui/Field';
import { NumberField } from '../ui/NumberField';
import { Alert } from '../ui/Alert';
import { ImageDropzone } from '../ui/ImageDropzone';
import { IconButton } from '../ui/IconButton';
import type { Person } from '../ui/PeopleFilter';
import './PhotoPostDialog.css';

const SOURCES: { value: PhotoSource; label: string }[] = [
  { value: 'OFFICIAL', label: 'Official' },
  { value: 'MEDIA', label: 'Media' },
  { value: 'FAN', label: 'Fan' },
];

/** Add or edit a photo post in a Radix Dialog. The form is mounted only while the dialog is open, so it starts fresh. */
export function PhotoPostDialog({
  open,
  post,
  people,
  onSaved,
  onOpenChange,
}: {
  open: boolean;
  post?: PhotoPost;
  people: Person[];
  onSaved: (post: PhotoPost) => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="pdialog__overlay" />
        <Dialog.Content className="pdialog" aria-describedby={undefined}>
          <div className="pdialog__head">
            <Dialog.Title className="pdialog__title">{post ? 'Edit post' : 'Add post'}</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton label="Close" icon={X} />
            </Dialog.Close>
          </div>
          <PhotoPostForm post={post} people={people} onSaved={onSaved} onCancel={() => onOpenChange(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PhotoPostForm({
  post,
  people,
  onSaved,
  onCancel,
}: {
  post?: PhotoPost;
  people: Person[];
  onSaved: (post: PhotoPost) => void;
  onCancel: () => void;
}) {
  const idPrefix = useId();
  const [postUrl, setPostUrl] = useState(post?.postUrl ?? '');
  const [image, setImage] = useState<{ mediaId: number; url: string } | null>(
    post ? { mediaId: mediaIdOf(post.imageUrl), url: post.imageUrl } : null,
  );
  const [title, setTitle] = useState(post?.title ?? '');
  const titleRef = useRef<HTMLTextAreaElement>(null);
  // Grows with the text (CSS caps it at 4 rows, then it scrolls).
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);
  // A new post starts on today's date (local day).
  const [takenOn, setTakenOn] = useState(post?.takenOn ?? toIsoDay(new Date()));
  // Today is only a default: "Fetch from X" replaces it, but never a date the user chose (or that a saved post has).
  const [dateChosen, setDateChosen] = useState(!!post);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [source, setSource] = useState<PhotoSource>(post?.source ?? 'OFFICIAL');
  const [who, setWho] = useState<string[]>(post?.profiles ?? []);
  const [photoCount, setPhotoCount] = useState<number | null>(post?.photoCount ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<ErrorMessage | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const errorOf = (field: string) => fieldErrors.find((e) => e.field === field)?.message;

  async function fetchX() {
    setFetching(true);
    setFetchError(null);
    setFieldErrors((errs) => errs.filter((e) => e.field !== 'postUrl' && e.field !== 'mediaId'));
    try {
      const got = await fetchFromX(postUrl.trim());
      setImage({ mediaId: got.mediaId, url: got.mediaUrl });
      const skipped: string[] = [];
      if (got.title) {
        if (title.trim() === '') setTitle(got.title);
        else skipped.push('Title');
      }
      if (got.takenOn) {
        if (dateChosen) skipped.push('Date');
        else setTakenOn(got.takenOn);
      }
      toast.success(
        skipped.length > 0
          ? `Fetched from X. Kept your ${skipped.join(' and ').toLowerCase()}`
          : 'Fetched from X',
      );
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length > 0) setFetchError(err.fieldErrors[0].message);
      else if (err instanceof ApiError && err.code?.startsWith('X_')) setFetchError(err.detail);
      else setFetchError(errorMessage(err).title);
    } finally {
      setFetching(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    // This form lives in a portal; React still bubbles its submit to a form around the trigger (the work editor).
    e.stopPropagation();
    if (!image) {
      setFieldErrors([{ field: 'mediaId', message: 'Choose an image first' }]);
      return;
    }
    setSaving(true);
    setFormError(null);
    setFieldErrors([]);
    try {
      const input: PhotoPostInput = {
        postUrl: postUrl.trim(),
        mediaId: image.mediaId,
        title: cleanTitle(title),
        takenOn,
        source,
        photoCount,
        profiles: who,
      };
      onSaved(post ? await updatePhoto(post.id, input) : await createPhoto(input));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PHOTO_POST_EXISTS') {
        setFieldErrors([{ field: 'postUrl', message: err.detail }]);
      } else {
        setFormError(errorMessage(err));
        setFieldErrors(err instanceof ApiError ? err.fieldErrors : []);
      }
      setSaving(false);
    }
  }

  return (
    <form className="pdialog__form" onSubmit={submit} noValidate>
      {formError && <Alert title={formError.title} hint={formError.hint} />}

      <Field label="Post link (Instagram or X)" error={errorOf('postUrl') ?? fetchError}>
        {(f) => (
          <div className="pdialog__link">
            <input
              id={f.id}
              type="text"
              value={postUrl}
              aria-invalid={f.invalid || undefined}
              aria-describedby={f.describedBy}
              onChange={(e) => {
                setPostUrl(e.target.value);
                setFetchError(null);
              }}
            />
            {isXStatusUrl(postUrl) && (
              <button type="button" className="button" disabled={fetching || uploading || saving} onClick={() => void fetchX()}>
                {fetching ? <Loader2 className="icon icon--spin" aria-hidden="true" /> : <Download className="icon" aria-hidden="true" />}
                {fetching ? 'Fetching…' : 'Fetch from X'}
              </button>
            )}
          </div>
        )}
      </Field>

      <div className="field">
        <span className="field__label">Image</span>
        <ImageDropzone
          label="Image"
          value={image ? { url: image.url } : null}
          aspect="auto"
          maxSide={1600}
          invalid={!!errorOf('mediaId')}
          onBusyChange={setUploading}
          onUploaded={(media) => {
            setImage({ mediaId: media.id, url: media.url });
            setFieldErrors((errs) => errs.filter((e) => e.field !== 'mediaId'));
          }}
        />
        {errorOf('mediaId') && <p className="field__error">{errorOf('mediaId')}</p>}
      </div>

      <Field label="Title" hint="Press Enter for a new line" error={errorOf('title')}>
        {(f) => (
          <textarea
            id={f.id}
            ref={titleRef}
            className="pdialog__title-input"
            rows={2}
            value={title}
            aria-invalid={f.invalid || undefined}
            aria-describedby={f.describedBy}
            onChange={(e) => setTitle(e.target.value)}
          />
        )}
      </Field>
      <div className="pdialog__row">
        <Field label="Date" error={errorOf('takenOn')}>
          {(f) => (
            <DatePicker
              id={f.id}
              value={takenOn}
              onChange={(v) => {
                if (!v) return;
                setTakenOn(v);
                setDateChosen(true);
              }}
              aria-invalid={f.invalid || undefined}
              aria-describedby={f.describedBy}
            />
          )}
        </Field>
        <Field label="Photo count (optional)" hint="Shown as a badge, 1-99" error={errorOf('photoCount')}>
          {(f) => (
            <NumberField
              id={f.id}
              value={photoCount}
              onChange={setPhotoCount}
              min={1}
              max={99}
              aria-invalid={f.invalid || undefined}
              aria-describedby={f.describedBy}
            />
          )}
        </Field>
      </div>

      <div className="field">
        <span className="field__label" id={`${idPrefix}-source`}>
          Source
        </span>
        <div className="pdialog__toggles" role="group" aria-labelledby={`${idPrefix}-source`}>
          {SOURCES.map((s) => (
            <button
              key={s.value}
              type="button"
              className="button button--s pdialog__toggle"
              aria-pressed={source === s.value}
              onClick={() => setSource(s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
        {errorOf('source') && <p className="field__error">{errorOf('source')}</p>}
      </div>

      {people.length > 0 && (
        <div className="field">
          <span className="field__label" id={`${idPrefix}-people`}>
            People
          </span>
          <div className="pdialog__toggles" role="group" aria-labelledby={`${idPrefix}-people`}>
            {people.map((p) => (
              <button
                key={p.slug}
                type="button"
                className="button button--s pdialog__toggle pdialog__toggle--person"
                aria-pressed={who.includes(p.slug)}
                onClick={() => setWho((w) => (w.includes(p.slug) ? w.filter((s) => s !== p.slug) : [...w, p.slug]))}
              >
                {p.avatarUrl ? <img src={p.avatarUrl} alt="" /> : null}
                {p.name}
              </button>
            ))}
          </div>
          {errorOf('profiles') && <p className="field__error">{errorOf('profiles')}</p>}
        </div>
      )}

      <div className="form-actions">
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button button--primary" disabled={saving || uploading}>
          Save
        </button>
      </div>
    </form>
  );
}

/** Keeps the line breaks; drops trailing spaces from every line and blank lines at both ends (the server does the same). */
function cleanTitle(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

/** The admin API returns `/api/media/{id}`, so the id of the stored image is its last path segment. */
function mediaIdOf(imageUrl: string): number {
  const id = Number(imageUrl.slice(imageUrl.lastIndexOf('/') + 1));
  return Number.isFinite(id) ? id : 0;
}
