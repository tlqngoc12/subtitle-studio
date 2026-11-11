import { ImagePlus } from 'lucide-react';
import { useId, useRef, useState, type DragEvent } from 'react';
import '../ui/ImageDropzone.css';
import './PageUploader.css';

/** Drop zone and file input for one or many page screenshots (PNG, JPEG, WebP). */
export function PageUploader({
  disabled,
  busy,
  onFiles,
}: {
  disabled: boolean;
  busy: boolean;
  onFiles: (files: File[]) => void;
}) {
  const id = useId();
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function drop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    if (disabled || busy) return;
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (files.length) onFiles(files);
  }

  return (
    <div
      className={over ? 'dropzone dropzone--active uploader' : 'dropzone uploader'}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
    >
      <ImagePlus className="dropzone__icon" aria-hidden="true" />
      <label htmlFor={id} className="uploader__label">
        Add page screenshots
      </label>
      <p className="dropzone__hint">Drop images here or choose files. They are added in file-name order.</p>
      <input
        id={id}
        ref={input}
        className="visually-hidden"
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        disabled={disabled || busy}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
      <button type="button" className="button button--s" disabled={disabled || busy} onClick={() => input.current?.click()}>
        Choose files
      </button>
      {busy && <p className="dropzone__hint">Uploading…</p>}
    </div>
  );
}
