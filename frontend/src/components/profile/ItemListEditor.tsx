import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { IconButton } from '../ui/IconButton';
import './ItemListEditor.css';

/** Editable list of GALLERY / LINKS / FACTS entries: add, remove, move up and down. */
export function ItemListEditor<T extends { key: number }>({
  rows,
  onChange,
  newRow,
  noun,
  legend,
  renderRow,
}: {
  rows: T[];
  /** A state setter: every change is applied to the latest rows, so uploads finishing later lose nothing. */
  onChange: Dispatch<SetStateAction<T[]>>;
  newRow: () => T;
  /** Lower-case noun used in the button labels, e.g. "link" → "Add link", "Delete link". */
  noun: string;
  legend: (index: number) => string;
  renderRow: (row: T, index: number, update: (patch: Partial<T>) => void) => ReactNode;
}) {
  function swap(key: number, offset: number) {
    onChange((prev) => {
      const i = prev.findIndex((r) => r.key === key);
      const j = i + offset;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  return (
    <div className="items">
      {rows.map((row, i) => (
        <fieldset key={row.key} className="items__row">
          <legend>{legend(i)}</legend>
          <div className="items__fields">
            {renderRow(row, i, (patch) =>
              onChange((prev) => prev.map((r) => (r.key === row.key ? { ...r, ...patch } : r))),
            )}
          </div>
          <div className="items__tools">
            <IconButton label={`Move ${noun} up`} icon={ArrowUp} disabled={i === 0} onClick={() => swap(row.key, -1)} />
            <IconButton
              label={`Move ${noun} down`}
              icon={ArrowDown}
              disabled={i === rows.length - 1}
              onClick={() => swap(row.key, 1)}
            />
            <IconButton
              label={`Delete ${noun}`}
              icon={X}
              onClick={() => onChange((prev) => prev.filter((r) => r.key !== row.key))}
            />
          </div>
        </fieldset>
      ))}
      <button type="button" className="button button--s" onClick={() => onChange((prev) => [...prev, newRow()])}>
        <Plus className="icon" aria-hidden="true" />
        {`Add ${noun}`}
      </button>
    </div>
  );
}
