import * as Popover from '@radix-ui/react-popover';
import { UserPlus } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { ImageDropzone } from '../ui/ImageDropzone';
import { createPerson, listPeople, type Person } from '../../api/works';
import { errorMessage } from '../../lib/errors';
import { normalizeForSearch } from '../../lib/search';
import { PopoverPanel } from '../ui/PopoverPanel';
import '../profile/MemberMenu.css';
import './WorkEditor.css';
import { FormActions } from '../ui/FormActions';

/**
 * `+ Person`: a popover searching the people directory (accent-insensitive), hiding people already credited, with
 * `Create "name"` at the end. Creating asks for an optional avatar (uploaded at 400 px) and then picks the new person.
 */
export function PersonPicker({ exclude, onPick }: { exclude: number[]; onPick: (person: Person) => void }) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<{ id: number; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCreating(false);
    setError(null);
    listPeople()
      .then(setPeople)
      .catch((e) => {
        setPeople([]);
        setError(errorMessage(e).title);
      });
  }, [open]);

  const q = normalizeForSearch(query);
  const matches = useMemo(
    () => (people ?? []).filter((p) => !exclude.includes(p.id) && normalizeForSearch(p.name).includes(q)),
    [people, exclude, q],
  );
  const exact = (people ?? []).some((p) => normalizeForSearch(p.name) === q);

  async function create(e: FormEvent) {
    e.preventDefault();
    // This form lives in a portal; React still bubbles its submit to a form around the trigger (the work editor).
    e.stopPropagation();
    setBusy(true);
    setError(null);
    try {
      const person = await createPerson({ name: name.trim(), avatarMediaId: avatar?.id ?? null });
      setOpen(false);
      onPick(person);
    } catch (err) {
      setError(err instanceof ApiError && err.fieldErrors.length > 0 ? err.fieldErrors[0].message : errorMessage(err).title);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" className="button button--s">
          <UserPlus className="icon" aria-hidden="true" />
          Person
        </button>
      </Popover.Trigger>
      <PopoverPanel className="wpicker" align="start">
        {creating ? (
          <form className="wpicker__create" onSubmit={create}>
            <label htmlFor="wpicker-name">Name</label>
            <input id="wpicker-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
            <span className="field__label">Avatar (optional)</span>
            <ImageDropzone
              label="Avatar"
              value={avatar}
              aspect="1/1"
              maxSide={400}
              onBusyChange={setBusy}
              onUploaded={(media) => setAvatar({ id: media.id, url: media.url })}
              onRemove={() => setAvatar(null)}
            />
            {error && (
              <p className="field__error" role="alert">
                {error}
              </p>
            )}
            <FormActions tight>
              <button type="button" className="button" onClick={() => setCreating(false)}>
                Back
              </button>
              <button type="submit" className="button button--primary" disabled={busy || !name.trim()}>
                Create person
              </button>
            </FormActions>
          </form>
        ) : (
          <div className="wpicker__list">
            <input
              type="search"
              aria-label="Search people"
              placeholder="Search people"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {error && <p className="field__error">{error}</p>}
            {people === null && <p className="muted">Loading…</p>}
            {matches.map((p) => (
              <button
                key={p.id}
                type="button"
                className="member-menu__item"
                onClick={() => {
                  setOpen(false);
                  onPick(p);
                }}
              >
                {p.avatarUrl ? <img className="wpicker__mini" src={p.avatarUrl} alt="" /> : null}
                {p.name}
              </button>
            ))}
            {people !== null && query.trim() !== '' && !exact && (
              <button
                type="button"
                className="member-menu__item"
                onClick={() => {
                  setName(query.trim());
                  setAvatar(null);
                  setCreating(true);
                }}
              >
                {`Create “${query.trim()}”`}
              </button>
            )}
          </div>
        )}
      </PopoverPanel>
    </Popover.Root>
  );
}
