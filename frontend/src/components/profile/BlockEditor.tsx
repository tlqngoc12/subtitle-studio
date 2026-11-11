import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError, type FieldError } from '../../api/client';
import type { BlockInput, BlockType, ProfileBlock } from '../../api/profiles';
import { errorMessage, type ErrorMessage } from '../../lib/errors';
import { ImageDropzone, previewOf, toPicked, type PickedImage } from '../ui/ImageDropzone';
import { ItemListEditor } from './ItemListEditor';
import { Alert } from '../ui/Alert';
import './BlockEditor.css';

export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  TEXT: 'Text',
  IMAGE: 'Image',
  GALLERY: 'Gallery',
  EMBED: 'Music / Video',
  LINKS: 'Links',
  FACTS: 'Quick facts',
  CHIPS: 'Chips',
};

interface Row {
  key: number;
  label: string;
  value: string;
  image: PickedImage | null;
}

const blankToNull = (s: string) => (s.trim() === '' ? null : s);

/** Form for one block; `onSave` rejecting with an ApiError keeps the form open and shows the errors. */
export function BlockEditor({
  type,
  initial,
  onSave,
  onCancel,
}: {
  type: BlockType;
  initial?: ProfileBlock;
  onSave: (input: BlockInput) => Promise<void>;
  onCancel: () => void;
}) {
  const idPrefix = useId();
  const nextKey = useRef(0);
  const newRow = (label = '', value = '', image: PickedImage | null = null): Row => ({
    key: nextKey.current++,
    label,
    value,
    image,
  });

  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [caption, setCaption] = useState(initial?.caption ?? '');
  const [embedUrl, setEmbedUrl] = useState(initial?.embedUrl ?? '');
  const [image, setImage] = useState<PickedImage | null>(
    initial?.mediaId != null && initial.mediaUrl ? { mediaId: initial.mediaId, mediaUrl: initial.mediaUrl } : null,
  );
  const [rows, setRows] = useState<Row[]>(() =>
    (initial?.items ?? []).map((it) =>
      newRow(
        it.label ?? '',
        it.value ?? '',
        it.mediaId != null && it.mediaUrl ? { mediaId: it.mediaId, mediaUrl: it.mediaUrl } : null,
      ),
    ),
  );
  const [uploads, setUploads] = useState(0);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<ErrorMessage | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);

  const errorOf = (field: string) => fieldErrors.find((e) => e.field === field)?.message;
  const onBusyChange = (busy: boolean) => setUploads((n) => n + (busy ? 1 : -1));

  function input(): BlockInput {
    const base: BlockInput = {
      type,
      title: blankToNull(title),
      body: null,
      mediaId: null,
      caption: null,
      embedUrl: null,
      items: [],
    };
    switch (type) {
      case 'TEXT':
        return { ...base, body: blankToNull(body) };
      case 'IMAGE':
        return { ...base, mediaId: image?.mediaId ?? null, caption: blankToNull(caption) };
      case 'EMBED':
        return { ...base, embedUrl: blankToNull(embedUrl) };
      case 'GALLERY':
        return {
          ...base,
          items: rows.map((r) => ({ label: blankToNull(r.label), value: null, mediaId: r.image?.mediaId ?? null })),
        };
      case 'CHIPS':
        return {
          ...base,
          items: rows.map((r) => ({ label: blankToNull(r.label), value: null, mediaId: null })),
        };
      case 'LINKS':
      case 'FACTS':
        return {
          ...base,
          items: rows.map((r) => ({ label: blankToNull(r.label), value: blankToNull(r.value), mediaId: null })),
        };
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    setFieldErrors([]);
    try {
      await onSave(input());
    } catch (err) {
      setFormError(errorMessage(err));
      setFieldErrors(err instanceof ApiError ? err.fieldErrors : []);
      setSaving(false);
    }
  }

  function field(name: string, label: string, control: (props: FieldProps) => ReactNode, hint?: string) {
    const id = `${idPrefix}-${name}`;
    const message = errorOf(name);
    return (
      <div className="field" key={name}>
        <label htmlFor={id}>{label}</label>
        {control({
          id,
          'aria-invalid': message ? true : undefined,
          'aria-describedby': message ? `${id}-error` : undefined,
        })}
        {hint && <p className="field__hint">{hint}</p>}
        {message && (
          <p className="field__error" id={`${id}-error`}>
            {message}
          </p>
        )}
      </div>
    );
  }

  const text = (value: string, set: (v: string) => void) => (props: FieldProps) => (
    <input {...props} type="text" value={value} onChange={(e) => set(e.target.value)} />
  );

  return (
    <form className="peditor" aria-label={`${BLOCK_TYPE_LABELS[type]} block`} onSubmit={submit} noValidate>
      <p className="peditor__kind">{BLOCK_TYPE_LABELS[type]}</p>
      {formError && (
        <Alert title={formError.title} hint={formError.hint} />
      )}

      {field('title', 'Title', text(title, setTitle), 'Optional')}

      {type === 'TEXT' &&
        field(
          'body',
          'Content',
          (props) => <textarea {...props} rows={8} value={body} onChange={(e) => setBody(e.target.value)} />,
          'Markdown supported: **bold**, *italic*, - list, [name](https://link)',
        )}

      {type === 'IMAGE' && (
        <>
          <div className="field">
            <ImageDropzone
              label="Image"
              value={previewOf(image)}
              aspect="auto"
              maxSide={null}
              onUploaded={(media) => setImage(toPicked(media))}
              onBusyChange={onBusyChange}
              invalid={!!errorOf('mediaId')}
              describedBy={errorOf('mediaId') ? `${idPrefix}-mediaId-error` : undefined}
            />
            {errorOf('mediaId') && (
              <p className="field__error" id={`${idPrefix}-mediaId-error`}>
                {errorOf('mediaId')}
              </p>
            )}
          </div>
          {field('caption', 'Caption', text(caption, setCaption))}
        </>
      )}

      {type === 'EMBED' &&
        field('embedUrl', 'YouTube or Spotify link', text(embedUrl, setEmbedUrl), 'Paste a link to a song, album, playlist or video')}

      {type === 'GALLERY' && (
        <ItemListEditor
          rows={rows}
          onChange={setRows}
          newRow={() => newRow()}
          noun="image"
          legend={(i) => `Image ${i + 1}`}
          renderRow={(row, i, update) => (
            <>
              <ImageDropzone
                label={`Gallery image ${i + 1}`}
                value={previewOf(row.image)}
                aspect="auto"
                maxSide={null}
                onUploaded={(media) => update({ image: toPicked(media) })}
                onBusyChange={onBusyChange}
                invalid={!!errorOf(`items[${i}].mediaId`)}
              />
              {errorOf(`items[${i}].mediaId`) && <p className="field__error">{errorOf(`items[${i}].mediaId`)}</p>}
              {field(`items[${i}].label`, 'Image caption', text(row.label, (v) => update({ label: v })))}
            </>
          )}
        />
      )}

      {type === 'LINKS' && (
        <ItemListEditor
          rows={rows}
          onChange={setRows}
          newRow={() => newRow()}
          noun="link"
          legend={(i) => `Item ${i + 1}`}
          renderRow={(row, i, update) => (
            <>
              {field(`items[${i}].label`, 'Link name', text(row.label, (v) => update({ label: v })))}
              {field(`items[${i}].value`, 'URL', text(row.value, (v) => update({ value: v })))}
            </>
          )}
        />
      )}

      {type === 'FACTS' && (
        <ItemListEditor
          rows={rows}
          onChange={setRows}
          newRow={() => newRow()}
          noun="row"
          legend={(i) => `Row ${i + 1}`}
          renderRow={(row, i, update) => (
            <>
              {field(`items[${i}].label`, 'Label', text(row.label, (v) => update({ label: v })))}
              {field(`items[${i}].value`, 'Value', text(row.value, (v) => update({ value: v })))}
            </>
          )}
        />
      )}

      {type === 'CHIPS' && (
        <ItemListEditor
          rows={rows}
          onChange={setRows}
          newRow={() => newRow()}
          noun="chip"
          legend={(i) => `Chip ${i + 1}`}
          renderRow={(row, i, update) =>
            field(`items[${i}].label`, 'Label', text(row.label, (v) => update({ label: v })))
          }
        />
      )}

      {errorOf('items') && <p className="field__error">{errorOf('items')}</p>}

      <div className="form-actions form-actions--tight">
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button button--primary" disabled={saving || uploads > 0}>
          Save
        </button>
      </div>
    </form>
  );
}

interface FieldProps {
  id: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}
