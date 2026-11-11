import { Plus, X } from 'lucide-react';
import { useId, type Dispatch, type SetStateAction } from 'react';
import type { FieldError } from '../../api/client';
import type { LinkKind } from '../../api/works';
import { IconButton } from '../ui/IconButton';
import { iconFor, ICON_KEYS, LinkIcon } from '../ui/LinkIcon';
import { Select } from '../ui/Select';
import { SortableItem, SortableList } from '../ui/SortableList';
import './WorkEditor.css';

/** A link as the editor holds it; `icon` '' means Auto (detected from the URL). */
export interface LinkRow {
  key: number;
  kind: LinkKind;
  label: string;
  url: string;
  icon: string;
}

const QUICK: { kind: Exclude<LinkKind, 'OTHER'>; label: string }[] = [
  { kind: 'PILOT', label: 'Pilot' },
  { kind: 'TRAILER', label: 'Trailer' },
  { kind: 'X', label: 'X' },
  { kind: 'INSTAGRAM', label: 'Instagram' },
];

const ICON_LABELS: Record<string, string> = {
  youtube: 'YouTube',
  x: 'X',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  netflix: 'Netflix',
  spotify: 'Spotify',
  applemusic: 'Apple Music',
  line: 'Line',
  threads: 'Threads',
  link: 'Generic link',
};

const ICON_OPTIONS = [{ value: '', label: 'Auto' }, ...ICON_KEYS.map((k) => ({ value: k, label: ICON_LABELS[k] }))];

/**
 * The link rows of a work: quick-add buttons (each fixed kind once), `+ Link` for any number of others, and per row
 * an icon choice, label and URL on one line, and Remove; drag the handle to reorder. `errors` are the server's field paths.
 */
export function LinksEditor({
  value,
  onChange,
  errors,
  newKey,
}: {
  value: LinkRow[];
  onChange: Dispatch<SetStateAction<LinkRow[]>>;
  errors: FieldError[];
  newKey: () => number;
}) {
  const idPrefix = useId();
  const has = (kind: LinkKind) => value.some((r) => r.kind === kind);
  const errorOf = (path: string) => errors.find((e) => e.field === path)?.message;
  const patch = (key: number, p: Partial<LinkRow>) =>
    onChange((rows) => rows.map((r) => (r.key === key ? { ...r, ...p } : r)));

  return (
    <fieldset className="wed__group">
      <legend>Links</legend>
      <div className="wed__quick">
        {QUICK.map((q) => (
          <button
            key={q.kind}
            type="button"
            className="button button--s"
            disabled={has(q.kind)}
            onClick={() => onChange((rows) => [...rows, { key: newKey(), kind: q.kind, label: q.label, url: '', icon: '' }])}
          >
            <Plus className="icon" aria-hidden="true" />
            {q.label}
          </button>
        ))}
        <button
          type="button"
          className="button button--s"
          onClick={() => onChange((rows) => [...rows, { key: newKey(), kind: 'OTHER', label: '', url: '', icon: '' }])}
        >
          <Plus className="icon" aria-hidden="true" />
          Link
        </button>
      </div>

      {value.length > 0 && (
        <div className="wed__link-head" aria-hidden="true">
          <span>Icon</span>
          <span>Label</span>
          <span>URL</span>
        </div>
      )}
      <SortableList items={value} onChange={onChange}>
        {value.map((row, i) => {
          const p = `links[${i}].`;
          const base = `${idPrefix}-${row.key}`;
          const urlError = errorOf(p + 'url') ?? errorOf(p + 'kind') ?? errorOf(p + 'icon');
          return (
            <SortableItem key={row.key} id={row.key} handleLabel={`Drag to reorder: link ${i + 1}`}>
              <div className="wed__link">
                <div className="wed__link-icon">
                  <span className="wed__icon" aria-hidden="true">
                    <LinkIcon iconKey={iconFor(row.url, row.icon || null)} />
                  </span>
                  <label htmlFor={`${base}-icon`} className="visually-hidden">{`Icon of link ${i + 1}`}</label>
                  <Select
                    id={`${base}-icon`}
                    value={row.icon}
                    onChange={(icon) => patch(row.key, { icon })}
                    options={ICON_OPTIONS}
                    aria-invalid={errorOf(p + 'icon') ? true : undefined}
                  />
                </div>
                <input
                  type="text"
                  className="wed__link-label"
                  aria-label={`Label ${i + 1}`}
                  placeholder="Label"
                  value={row.label}
                  aria-invalid={errorOf(p + 'label') ? true : undefined}
                  onChange={(e) => patch(row.key, { label: e.target.value })}
                />
                <input
                  type="text"
                  className="wed__link-url"
                  aria-label={`URL ${i + 1}`}
                  placeholder="https://"
                  value={row.url}
                  aria-invalid={errorOf(p + 'url') ? true : undefined}
                  onChange={(e) => patch(row.key, { url: e.target.value })}
                />
                <IconButton
                  label={`Remove link ${i + 1}`}
                  icon={X}
                  className="wed__link-remove"
                  onClick={() => onChange((rows) => rows.filter((r) => r.key !== row.key))}
                />
              </div>
              {errorOf(p + 'label') && <p className="field__error">{errorOf(p + 'label')}</p>}
              {urlError && <p className="field__error">{urlError}</p>}
            </SortableItem>
          );
        })}
      </SortableList>
      {errorOf('links') && <p className="field__error">{errorOf('links')}</p>}
    </fieldset>
  );
}
