import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import type { ReactNode } from 'react';

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
  onChange: (rows: T[]) => void;
  newRow: () => T;
  /** Lower-case noun used in the button labels, e.g. "link" → "Thêm link", "Xóa link". */
  noun: string;
  legend: (index: number) => string;
  renderRow: (row: T, index: number, update: (patch: Partial<T>) => void) => ReactNode;
}) {
  function swap(i: number, j: number) {
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  return (
    <div className="items">
      {rows.map((row, i) => (
        <fieldset key={row.key} className="items__row">
          <legend>{legend(i)}</legend>
          <div className="items__fields">
            {renderRow(row, i, (patch) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r))))}
          </div>
          <div className="items__tools">
            <button
              type="button"
              className="button button--icon"
              aria-label={`Di chuyển ${noun} lên`}
              title={`Di chuyển ${noun} lên`}
              disabled={i === 0}
              onClick={() => swap(i, i - 1)}
            >
              <ArrowUp className="icon" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="button button--icon"
              aria-label={`Di chuyển ${noun} xuống`}
              title={`Di chuyển ${noun} xuống`}
              disabled={i === rows.length - 1}
              onClick={() => swap(i, i + 1)}
            >
              <ArrowDown className="icon" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="button button--icon"
              aria-label={`Xóa ${noun}`}
              title={`Xóa ${noun}`}
              onClick={() => onChange(rows.filter((_, k) => k !== i))}
            >
              <X className="icon" aria-hidden="true" />
            </button>
          </div>
        </fieldset>
      ))}
      <button type="button" className="button button--small" onClick={() => onChange([...rows, newRow()])}>
        <Plus className="icon" aria-hidden="true" />
        {`Thêm ${noun}`}
      </button>
    </div>
  );
}
