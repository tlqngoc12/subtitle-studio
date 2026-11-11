import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { ApiError, type FieldError } from '../../api/client';
import {
  createPhoto,
  updatePhoto,
  type PhotoPost,
  type PhotoPostInput,
  type PhotoSource,
} from '../../api/photos';
import { errorMessage, type ErrorMessage } from '../../lib/errors';
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
  const [instagramUrl, setInstagramUrl] = useState(post?.instagramUrl ?? '');
  const [image, setImage] = useState<{ mediaId: number; url: string } | null>(
    post ? { mediaId: mediaIdOf(post.imageUrl), url: post.imageUrl } : null,
  );
  const [title, setTitle] = useState(post?.title ?? '');
  const [takenOn, setTakenOn] = useState(post?.takenOn ?? '');
  const [takenUntil, setTakenUntil] = useState(post?.takenUntil ?? '');
  const [source, setSource] = useState<PhotoSource>(post?.source ?? 'OFFICIAL');
  const [who, setWho] = useState<string[]>(post?.profiles ?? []);
  const [photoCount, setPhotoCount] = useState(post?.photoCount?.toString() ?? '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<ErrorMessage | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const errorOf = (field: string) => fieldErrors.find((e) => e.field === field)?.message;

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
    const count = photoCount.trim() === '' ? null : Number(photoCount);
    try {
      const input: PhotoPostInput = {
        instagramUrl: instagramUrl.trim(),
        mediaId: image.mediaId,
        title: title.trim(),
        takenOn,
        takenUntil: takenUntil === '' ? null : takenUntil,
        source,
        photoCount: count !== null && Number.isFinite(count) ? count : null,
        profiles: who,
      };
      onSaved(post ? await updatePhoto(post.id, input) : await createPhoto(input));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PHOTO_POST_EXISTS') {
        setFieldErrors([{ field: 'instagramUrl', message: err.detail }]);
      } else {
        setFormError(errorMessage(err));
        setFieldErrors(err instanceof ApiError ? err.fieldErrors : []);
      }
      setSaving(false);
    }
  }

  function field(name: string, label: string, control: (id: string, invalid: boolean) => React.ReactNode, hint?: string) {
    const id = `${idPrefix}-${name}`;
    const message = errorOf(name);
    return (
      <div className="field">
        <label htmlFor={id}>{label}</label>
        {control(id, !!message)}
        {hint && <p className="field__hint">{hint}</p>}
        {message && (
          <p className="field__error" id={`${id}-error`}>
            {message}
          </p>
        )}
      </div>
    );
  }

  const text = (value: string, set: (v: string) => void, type = 'text') => (id: string, invalid: boolean) => (
    <input
      id={id}
      type={type}
      value={value}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid ? `${id}-error` : undefined}
      onChange={(e) => set(e.target.value)}
    />
  );

  return (
    <form className="pdialog__form" onSubmit={submit} noValidate>
      {formError && <Alert title={formError.title} hint={formError.hint} />}

      {field('instagramUrl', 'Instagram link', text(instagramUrl, setInstagramUrl))}

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

      {field('title', 'Title', text(title, setTitle))}
      <div className="pdialog__row">
        {field('takenOn', 'Date', text(takenOn, setTakenOn, 'date'))}
        {field('takenUntil', 'End date (optional)', text(takenUntil, setTakenUntil, 'date'))}
      </div>

      <div className="field">
        <span className="pdialog__label" id={`${idPrefix}-source`}>
          Source
        </span>
        <div className="pdialog__toggles" role="group" aria-labelledby={`${idPrefix}-source`}>
          {SOURCES.map((s) => (
            <button
              key={s.value}
              type="button"
              className="pdialog__toggle"
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
          <span className="pdialog__label" id={`${idPrefix}-people`}>
            People
          </span>
          <div className="pdialog__toggles" role="group" aria-labelledby={`${idPrefix}-people`}>
            {people.map((p) => (
              <button
                key={p.slug}
                type="button"
                className="pdialog__toggle pdialog__toggle--person"
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

      {field('photoCount', 'Photo count (optional)', text(photoCount, setPhotoCount, 'number'), 'Shown as a badge, 1-99')}

      <div className="peditor__actions">
        <button type="submit" className="button button--primary" disabled={saving || uploading}>
          Save
        </button>
        <button type="button" className="button button--s" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** The admin API returns `/api/media/{id}`, so the id of the stored image is its last path segment. */
function mediaIdOf(imageUrl: string): number {
  const id = Number(imageUrl.slice(imageUrl.lastIndexOf('/') + 1));
  return Number.isFinite(id) ? id : 0;
}
