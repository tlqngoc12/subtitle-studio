import { useId, useState, type FormEvent } from 'react';
import { ApiError, type FieldError } from '../../api/client';
import { updateProfileHeader, type Profile } from '../../api/profiles';
import { errorMessage, type ErrorMessage } from '../../lib/errors';
import { Alert } from '../ui/Alert';
import { ImagePicker, type PickedImage } from './ImagePicker';
import './BlockEditor.css';

const blankToNull = (s: string) => (s.trim() === '' ? null : s.trim());

/**
 * Header form of a profile: display name, tagline, full name and portrait. The GROUP (EmiBonnie) only has a display
 * name and a portrait (its avatar in the Photos and Works filters). A server rejection keeps the form open with the
 * messages under their fields.
 */
export function MemberHeaderEditor({
  profile,
  onSaved,
  onCancel,
}: {
  profile: Profile;
  onSaved: (profile: Profile) => void;
  onCancel: () => void;
}) {
  const idPrefix = useId();
  const group = profile.kind === 'GROUP';
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [tagline, setTagline] = useState(profile.tagline ?? '');
  const [fullName, setFullName] = useState(profile.fullName ?? '');
  const [portrait, setPortrait] = useState<PickedImage | null>(
    profile.portraitMediaId != null && profile.portraitUrl
      ? { mediaId: profile.portraitMediaId, mediaUrl: profile.portraitUrl }
      : null,
  );
  const [uploads, setUploads] = useState(0);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<ErrorMessage | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const errorOf = (field: string) => fieldErrors.find((e) => e.field === field)?.message;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    setFieldErrors([]);
    try {
      const saved = await updateProfileHeader(profile.slug, {
        displayName: displayName.trim(),
        tagline: group ? profile.tagline : blankToNull(tagline),
        fullName: group ? profile.fullName : blankToNull(fullName),
        portraitMediaId: portrait?.mediaId ?? null,
      });
      onSaved(saved);
    } catch (err) {
      setFormError(errorMessage(err));
      setFieldErrors(err instanceof ApiError ? err.fieldErrors : []);
      setSaving(false);
    }
  }

  function text(name: string, label: string, value: string, set: (v: string) => void) {
    const id = `${idPrefix}-${name}`;
    const message = errorOf(name);
    return (
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          type="text"
          value={value}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? `${id}-error` : undefined}
          onChange={(e) => set(e.target.value)}
        />
        {message && (
          <p className="field__error" id={`${id}-error`}>
            {message}
          </p>
        )}
      </div>
    );
  }

  return (
    <form className="peditor" aria-label={`${profile.displayName} header`} onSubmit={submit} noValidate>
      {formError && <Alert title={formError.title} hint={formError.hint} />}
      {text('displayName', 'Display name', displayName, setDisplayName)}
      {!group && text('tagline', 'Tagline', tagline, setTagline)}
      {!group && text('fullName', 'Full name', fullName, setFullName)}
      <div className="field">
        <ImagePicker
          value={portrait}
          onChange={setPortrait}
          onBusyChange={(busy) => setUploads((n) => n + (busy ? 1 : -1))}
          maxSide={1600}
          invalid={!!errorOf('portraitMediaId')}
        />
        {group && <p className="field__hint">Used as the EmiBonnie avatar in filters</p>}
        {errorOf('portraitMediaId') && <p className="field__error">{errorOf('portraitMediaId')}</p>}
      </div>
      <div className="peditor__actions">
        <button type="submit" className="button button--primary" disabled={saving || uploads > 0}>
          Save
        </button>
        <button type="button" className="button button--s" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
