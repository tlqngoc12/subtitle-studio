import { useState } from 'react';
import type { WorkCategory } from '../../api/works';
import { CATEGORIES, CATEGORY_LABELS } from './categories';
import './CategoryToggleGroup.css';

/** The category choice of the work editor: toggle buttons, at least one on; the order of choosing is kept. */
export function CategoryToggleGroup({
  value,
  onChange,
  error,
}: {
  value: WorkCategory[];
  onChange: (value: WorkCategory[]) => void;
  error?: string | null;
}) {
  const [last, setLast] = useState(false);

  function toggle(category: WorkCategory) {
    if (!value.includes(category)) {
      setLast(false);
      onChange([...value, category]);
    } else if (value.length === 1) {
      setLast(true);
    } else {
      setLast(false);
      onChange(value.filter((c) => c !== category));
    }
  }

  const message = last ? 'Choose at least one category.' : error;
  return (
    <div className="cat-toggle">
      <div className="cat-toggle__items" role="group" aria-label="Categories">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className="button button--s cat-toggle__item"
            aria-pressed={value.includes(c)}
            onClick={() => toggle(c)}
          >
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>
      {message && (
        <p className="field__error" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
