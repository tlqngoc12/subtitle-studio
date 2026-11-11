import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { addFanfic, previewFanfic, type Fanfic, type FanficPreview } from '../../api/fanfics';
import { errorMessage } from '../../lib/errors';
import { Field } from '../ui/Field';
import { IconButton } from '../ui/IconButton';
import { FanficCard } from './FanficCard';
import './AddFanficDialog.css';

/** Add a fanfic: paste a Wattpad link, Fetch shows the card, Save stores it. The form is mounted only while open. */
export function AddFanficDialog({
  open,
  onSaved,
  onOpenChange,
}: {
  open: boolean;
  onSaved: (fanfic: Fanfic) => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fdialog__overlay" />
        <Dialog.Content className="fdialog" aria-describedby={undefined}>
          <div className="fdialog__head">
            <Dialog.Title className="fdialog__title">Add fanfic</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton label="Close" icon={X} />
            </Dialog.Close>
          </div>
          <AddFanficForm onSaved={onSaved} onCancel={() => onOpenChange(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AddFanficForm({ onSaved, onCancel }: { onSaved: (fanfic: Fanfic) => void; onCancel: () => void }) {
  const errorId = useId();
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<{ url: string; story: FanficPreview } | null>(null);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchStory(e: FormEvent) {
    e.preventDefault();
    // This form lives in a portal; React still bubbles its submit to a form around the trigger.
    e.stopPropagation();
    const link = url.trim();
    if (!link) {
      setError('Paste a Wattpad story link first.');
      return;
    }
    setFetching(true);
    setError(null);
    setPreview(null);
    try {
      setPreview({ url: link, story: await previewFanfic(link) });
    } catch (err) {
      setError(errorMessage(err).title);
    } finally {
      setFetching(false);
    }
  }

  async function save() {
    if (!preview) return;
    setSaving(true);
    setError(null);
    try {
      onSaved(await addFanfic(preview.url));
    } catch (err) {
      setError(errorMessage(err).title);
      setSaving(false);
    }
  }

  return (
    <form className="fdialog__form" onSubmit={fetchStory} noValidate>
      <div className="fdialog__link">
        <Field label="Wattpad story link" error={null} className="fdialog__field">
          {(f) => (
            <input
              id={f.id}
              type="text"
              inputMode="url"
              autoComplete="off"
              placeholder="https://www.wattpad.com/story/…"
              value={url}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : f.describedBy}
              onChange={(e) => {
                setUrl(e.target.value);
                setPreview(null);
              }}
            />
          )}
        </Field>
        <button type="submit" className="button button--s" disabled={fetching || saving}>
          {fetching ? 'Fetching…' : 'Fetch'}
        </button>
      </div>
      {error && (
        <p id={errorId} className="field__error" role="alert">
          {error}
        </p>
      )}

      {preview && <FanficCard fanfic={preview.story} />}

      <div className="form-actions">
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="button button--primary" disabled={!preview || saving} onClick={() => void save()}>
          Save
        </button>
      </div>
    </form>
  );
}
