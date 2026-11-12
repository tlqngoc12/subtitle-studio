import './FilterPills.css';

export interface FilterOption<T extends string | null> {
  value: T;
  label: string;
}

/**
 * One row of toggle pills (`aria-pressed`) that filters a list; the chosen pill is purple (state). Scrolls sideways
 * on phones. Shared by Works categories and Fanfics status. Options carry their own values, so `null` can mean All.
 */
export function FilterPills<T extends string | null>({
  label,
  options,
  value,
  onChange,
}: {
  /** Accessible name of the group. */
  label: string;
  options: readonly FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="filter-pills" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value ?? '__all'}
          type="button"
          className="button button--s filter-pills__pill"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
