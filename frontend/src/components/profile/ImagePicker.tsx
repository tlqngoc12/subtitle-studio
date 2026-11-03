import { useId, useState } from 'react';
import { uploadMedia } from '../../api/profiles';
import { errorMessage } from '../../lib/errors';

export interface PickedImage {
  mediaId: number;
  mediaUrl: string;
}

/** Uploads the chosen file right away and shows a preview; `onBusyChange` lets the form block saving meanwhile. */
export function ImagePicker({
  value,
  onChange,
  onBusyChange,
  invalid,
  describedBy,
}: {
  value: PickedImage | null;
  onChange: (image: PickedImage) => void;
  onBusyChange: (busy: boolean) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    onBusyChange(true);
    try {
      const uploaded = await uploadMedia(file);
      onChange({ mediaId: uploaded.id, mediaUrl: uploaded.url });
    } catch (e) {
      setError(errorMessage(e).title);
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  return (
    <div className="picker">
      {value && <img className="picker__preview" src={value.mediaUrl} alt="Selected image" />}
      <label htmlFor={id}>Choose image</label>
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        disabled={busy}
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {busy && <p className="muted">Uploading image…</p>}
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
