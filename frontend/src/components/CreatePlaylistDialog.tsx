import * as Dialog from '@radix-ui/react-dialog';
import { Plus, X } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { ApiError, type FieldError } from '../api/client';
import { createPlaylist, type PlaylistDetail } from '../api/playlists';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import { Alert } from './ui/Alert';
import { FormActions } from './ui/FormActions';
import { IconButton } from './ui/IconButton';
import './CreatePlaylistDialog.css';

/** Create a playlist: Name (required) and Description (optional). The form is mounted only while the dialog is open. */
export function CreatePlaylistDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (playlist: PlaylistDetail) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="pldialog__overlay" />
        <Dialog.Content className="pldialog" aria-describedby={undefined}>
          <div className="pldialog__head">
            <Dialog.Title className="pldialog__title">Create playlist</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton label="Close" icon={X} />
            </Dialog.Close>
          </div>
          <CreatePlaylistForm onCreated={onCreated} onCancel={() => onOpenChange(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CreatePlaylistForm({ onCreated, onCancel }: { onCreated: (p: PlaylistDetail) => void; onCancel: () => void }) {
  const ids = useId();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const fieldError = (field: string) => fieldErrors.find((f) => f.field === field)?.message;

  async function submit(e: FormEvent) {
    e.preventDefault();
    // This form lives in a portal; React still bubbles its submit to a form around the trigger.
    e.stopPropagation();
    if (!name.trim()) return;
    setPending(true);
    setError(null);
    setFieldErrors([]);
    try {
      onCreated(await createPlaylist(name.trim(), description.trim() || undefined));
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError) setFieldErrors(err.fieldErrors);
      setPending(false);
    }
  }

  const nameError = fieldError('name');
  const descriptionError = fieldError('description');
  return (
    <form className="pldialog__form" onSubmit={submit} aria-label="New playlist" aria-busy={pending}>
      <div className="field">
        <label htmlFor={`${ids}-name`}>Name</label>
        <input
          id={`${ids}-name`}
          type="text"
          autoComplete="off"
          autoFocus
          value={name}
          maxLength={100}
          required
          onChange={(e) => setName(e.target.value)}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? `${ids}-name-error` : undefined}
        />
        {nameError && (
          <p className="field__error" id={`${ids}-name-error`}>
            {nameError}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor={`${ids}-description`}>Description (optional)</label>
        <input
          id={`${ids}-description`}
          type="text"
          autoComplete="off"
          value={description}
          maxLength={1000}
          onChange={(e) => setDescription(e.target.value)}
          aria-invalid={descriptionError ? true : undefined}
          aria-describedby={descriptionError ? `${ids}-description-error` : undefined}
        />
        {descriptionError && (
          <p className="field__error" id={`${ids}-description-error`}>
            {descriptionError}
          </p>
        )}
      </div>
      {error && <Alert title={error.title} />}
      <FormActions tight>
        <button className="button" type="button" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
        <button className="button button--primary" type="submit" disabled={pending}>
          <Plus className="icon" aria-hidden="true" />
          {pending ? 'Creating…' : 'Create playlist'}
        </button>
      </FormActions>
    </form>
  );
}
