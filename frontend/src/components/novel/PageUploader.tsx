import { ImagePlus } from 'lucide-react';
import { useId, useState, type DragEvent } from 'react';

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

  function drop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    if (disabled || busy) return;
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (files.length) onFiles(files);
  }

  return (
    <div
      className={over ? 'uploader uploader--over' : 'uploader'}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
    >
      <ImagePlus className="uploader__icon" aria-hidden="true" />
      <label htmlFor={id} className="uploader__label">
        Add page screenshots
      </label>
      <p className="uploader__hint">Drop images here or choose files. They are added in file-name order.</p>
      <input
        id={id}
        className="uploader__input"
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
      {busy && <p className="muted">Uploading…</p>}
    </div>
  );
}
