import { ImagePlus } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { uploadMedia, type UploadedMedia } from '../../api/profiles';
import { errorMessage } from '../../lib/errors';
import './ImageDropzone.css';

const ACCEPT = 'image/jpeg,image/png,image/webp';
export interface PickedImage {
  mediaId: number;
  mediaUrl: string;
}

/** For forms that keep the stored image as `{ mediaId, mediaUrl }`. */
export const toPicked = (media: UploadedMedia): PickedImage => ({ mediaId: media.id, mediaUrl: media.url });
export const previewOf = (image: PickedImage | null) => (image ? { url: image.mediaUrl } : null);

const isImage = (file: File) => ACCEPT.split(',').includes(file.type);

interface Props {
  label: string;
  value: { url: string } | null;
  aspect: '1/1' | '3/4' | '4/5' | '16/9' | 'auto';
  /** Ask the server to shrink the image to this longest side. */
  maxSide?: 400 | 1600 | null;
  onUploaded: (media: UploadedMedia) => void;
  onRemove?: () => void;
  /** Lets a form block saving while the upload runs. */
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}

/**
 * The one image picker: drop, choose or paste (Ctrl+V). It uploads the file itself and reports the stored media.
 * A paste is taken only when it comes from inside this dropzone or from inside the dialog that contains it
 * (and not from another dropzone), so two pickers on one page never both take it.
 */
export function ImageDropzone({
  label,
  value,
  aspect,
  maxSide = 1600,
  onUploaded,
  onRemove,
  onBusyChange,
  disabled,
  invalid,
  describedBy,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocked = busy || disabled;

  // Always call the latest upload from the document listener.
  const latest = useRef<(file: File) => void>(() => {});
  async function upload(file: File | undefined) {
    if (!file || blocked) return;
    if (!isImage(file)) {
      setError('Use a JPEG, PNG or WebP image.');
      return;
    }
    setError(null);
    setBusy(true);
    onBusyChange?.(true);
    try {
      onUploaded(await uploadMedia(file, maxSide ?? undefined));
    } catch (e) {
      setError(errorMessage(e).title);
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  latest.current = (file) => void upload(file);

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const el = root.current;
      const target = e.target instanceof Node ? e.target : null;
      if (!el || !target) return;
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
      if (!file) return;
      const inside = el.contains(target);
      const dialog = el.closest('[role="dialog"]');
      const inDialog = !!dialog && dialog.contains(target);
      const inOther = Array.from(document.querySelectorAll('.dropzone')).some((d) => d !== el && d.contains(target));
      if (!(inside || (inDialog && !inOther))) return;
      e.preventDefault();
      latest.current(file);
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    void upload(files.find((f) => f.type.startsWith('image/')) ?? files[0]);
  }

  return (
    <div className="dropzone-wrap">
      <div
        ref={root}
        role="group"
        aria-label={label}
        aria-describedby={describedBy}
        className={['dropzone', dragging && 'dropzone--active', invalid && 'dropzone--invalid', value && 'dropzone--filled']
          .filter(Boolean)
          .join(' ')}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {value ? (
          <img
            className="dropzone__preview"
            style={aspect === 'auto' ? undefined : { aspectRatio: aspect }}
            src={value.url}
            alt="Selected image"
          />
        ) : (
          <ImagePlus className="dropzone__icon" aria-hidden="true" />
        )}
        {!value && (
          <p className="dropzone__hint">{busy ? 'Uploading…' : 'Drop an image, paste with Ctrl+V, or'}</p>
        )}
        {value && busy && <p className="dropzone__hint">Uploading…</p>}
        <div className="dropzone__actions">
          <button type="button" className="button button--s" disabled={blocked} onClick={() => fileInput.current?.click()}>
            {value ? 'Replace' : 'Choose image'}
          </button>
          {value && onRemove && (
            <button type="button" className="button button--s button--danger" disabled={blocked} onClick={onRemove}>
              Remove
            </button>
          )}
        </div>
        <input
          ref={fileInput}
          className="visually-hidden"
          type="file"
          aria-label={`${label} file`}
          accept={ACCEPT}
          tabIndex={-1}
          onChange={(e) => {
            void upload(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
