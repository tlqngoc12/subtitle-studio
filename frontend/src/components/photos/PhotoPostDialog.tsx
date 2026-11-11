import * as Dialog from '@radix-ui/react-dialog';
import { ImagePlus, X } from 'lucide-react';
import { useId, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent } from 'react';
import { ApiError, type FieldError } from '../../api/client';
import {
  createPhoto,
  updatePhoto,
  type PhotoPost,
  type PhotoPostInput,
  type PhotoSource,
} from '../../api/photos';
import { uploadMedia } from '../../api/profiles';
import { errorMessage, type ErrorMessage } from '../../lib/errors';
import { Alert } from '../ui/Alert';
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
  const fileInput = useRef<HTMLInputElement>(null);
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
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<ErrorMessage | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const errorOf = (field: string) => fieldErrors.find((e) => e.field === field)?.message;

  async function upload(file: File | undefined) {
    if (!file) return;
    setFormError(null);
    setUploading(true);
    try {
      const uploaded = await uploadMedia(file, 1600);
      setImage({ mediaId: uploaded.id, url: uploaded.url });
      setFieldErrors((errs) => errs.filter((e) => e.field !== 'mediaId'));
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  // Ctrl+V of an image uploads it; anything else (text in the link field, say) pastes normally.
  function onPaste(e: ClipboardEvent) {
    const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
    if (!file) return;
    e.preventDefault();
    void upload(file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void upload(Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/')));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
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
    <form className="pdialog__form" onSubmit={submit} onPaste={onPaste} noValidate>
      {formError && <Alert title={formError.title} hint={formError.hint} />}

      {field('instagramUrl', 'Instagram link', text(instagramUrl, setInstagramUrl))}

      <div className="field">
        <span className="pdialog__label">Image</span>
        <div
          className={dragging ? 'pdrop pdrop--active' : 'pdrop'}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {image ? (
            <img className="pdrop__preview" src={image.url} alt="Selected image" />
          ) : (
            <ImagePlus className="pdrop__icon" aria-hidden="true" />
          )}
          <p className="pdrop__hint">{uploading ? 'Uploading…' : 'Drop an image, paste it with Ctrl+V, or'}</p>
          <button
            type="button"
            className="button button--small"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
          >
            Choose image
          </button>
          <input
            ref={fileInput}
            className="visually-hidden"
            type="file"
            aria-label="Image file"
            accept="image/jpeg,image/png,image/webp"
            tabIndex={-1}
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
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
        <button type="button" className="button button--small" onClick={onCancel}>
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
