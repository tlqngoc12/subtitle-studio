import * as Dialog from '@radix-ui/react-dialog';
import { ImagePlus, Pencil, Trash2, X } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ApiError } from '../../api/client';
import { ImageDropzone } from '../ui/ImageDropzone';
import { deletePerson, listPeople, updatePerson, type Person } from '../../api/works';
import { errorMessage } from '../../lib/errors';
import { Alert } from '../ui/Alert';
import { IconButton } from '../ui/IconButton';
import { LoadingText } from '../ui/LoadingText';
import { useConfirmDialog } from '../useConfirmDialog';
import '../photos/PhotoPostDialog.css';
import './PeopleDialog.css';

/**
 * The people directory in a dialog: rename a person, change the avatar (uploaded at 400 px) or delete someone who is
 * not credited anywhere (a person in use stays and a toast lists the works).
 */
export function PeopleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPeople(null);
    setError(null);
    listPeople()
      .then(setPeople)
      .catch((e) => {
        setPeople([]);
        setError(errorMessage(e).title);
      });
  }, [open]);

  const replace = (person: Person) => setPeople((all) => (all ?? []).map((p) => (p.id === person.id ? person : p)));

  async function remove(person: Person) {
    const ok = await confirm({ title: `Delete ${person.name}?`, confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    try {
      await deletePerson(person.id);
      setPeople((all) => (all ?? []).filter((p) => p.id !== person.id));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'PERSON_IN_USE') toast.error(e.detail);
      else toast.error(errorMessage(e).title);
    }
  }

  return (
    <>
      {confirmDialog}
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="pdialog__overlay" />
          <Dialog.Content className="pdialog" aria-describedby={undefined}>
            <div className="pdialog__head">
              <Dialog.Title className="pdialog__title">People</Dialog.Title>
              <Dialog.Close asChild>
                <IconButton label="Close" icon={X} />
              </Dialog.Close>
            </div>
            {error && <Alert title={error} />}
            {people === null && <LoadingText>Loading people…</LoadingText>}
            {people !== null && people.length === 0 && !error && <p className="muted">No people yet. Add them while editing a work.</p>}
            <ul className="ppl">
              {(people ?? []).map((p) => (
                <PersonRow key={p.id} person={p} onSaved={replace} onDelete={() => void remove(p)} />
              ))}
            </ul>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function PersonRow({ person, onSaved, onDelete }: { person: Person; onSaved: (p: Person) => void; onDelete: () => void }) {
  const id = useId();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(person.name);
  const [busy, setBusy] = useState(false);
  const [changingAvatar, setChangingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function fail(e: unknown) {
    setError(e instanceof ApiError && e.fieldErrors.length > 0 ? e.fieldErrors[0].message : errorMessage(e).title);
  }

  async function rename(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(await updatePerson(person.id, { name: name.trim(), avatarMediaId: person.avatarMediaId }));
      setRenaming(false);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function changeAvatar(mediaId: number) {
    setBusy(true);
    setError(null);
    try {
      onSaved(await updatePerson(person.id, { name: person.name, avatarMediaId: mediaId }));
      setChangingAvatar(false);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="ppl__row">
      {person.avatarUrl ? (
        <img className="ppl__avatar" src={person.avatarUrl} alt="" />
      ) : (
        <span className="ppl__avatar ppl__avatar--initial" aria-hidden="true">
          {person.name.trim().charAt(0).toUpperCase()}
        </span>
      )}
      <div className="ppl__main">
        {renaming ? (
          <form className="ppl__rename" onSubmit={rename}>
            <label htmlFor={`${id}-name`} className="visually-hidden">{`Name of ${person.name}`}</label>
            <input
              id={`${id}-name`}
              type="text"
              value={name}
              aria-invalid={error ? true : undefined}
              onChange={(e) => setName(e.target.value)}
            />
            <button type="submit" className="button button--primary" disabled={busy || !name.trim()}>
              Save
            </button>
            <button
              type="button"
              className="button button--s"
              onClick={() => {
                setRenaming(false);
                setName(person.name);
                setError(null);
              }}
            >
              Cancel
            </button>
          </form>
        ) : (
          <strong className="ppl__name">{person.name}</strong>
        )}
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </div>
      {!renaming && (
        <div className="ppl__actions">
          <IconButton label={`Rename ${person.name}`} icon={Pencil} disabled={busy} onClick={() => setRenaming(true)} />
          <IconButton
            label={`Change avatar of ${person.name}`}
            icon={ImagePlus}
            disabled={busy}
            aria-expanded={changingAvatar}
            onClick={() => setChangingAvatar((open) => !open)}
          />
          <IconButton label={`Delete ${person.name}`} icon={Trash2} className="button--danger" disabled={busy} onClick={onDelete} />
        </div>
      )}
      {changingAvatar && (
        <div className="ppl__dropzone">
          <ImageDropzone
            label={`Avatar of ${person.name}`}
            value={person.avatarUrl ? { url: person.avatarUrl } : null}
            aspect="1/1"
            maxSide={400}
            disabled={busy}
            onUploaded={(media) => void changeAvatar(media.id)}
          />
        </div>
      )}
    </li>
  );
}
