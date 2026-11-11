import type { WorkCategory } from '../../api/works';
import { CATEGORIES, CATEGORY_LABELS } from './categories';
import './CategoryPills.css';

/** `All` plus one pill per category; the chosen pill is orange (an action colour). Scrolls sideways on phones. */
export function CategoryPills({
  value,
  onChange,
}: {
  value: WorkCategory | null;
  onChange: (category: WorkCategory | null) => void;
}) {
  return (
    <div className="cpills" role="group" aria-label="Filter by category">
      <button type="button" className="button button--s cpills__pill" aria-pressed={value === null} onClick={() => onChange(null)}>
        All
      </button>
      {CATEGORIES.map((c) => (
        <button key={c} type="button" className="button button--s cpills__pill" aria-pressed={value === c} onClick={() => onChange(c)}>
          {CATEGORY_LABELS[c]}
        </button>
      ))}
    </div>
  );
}
