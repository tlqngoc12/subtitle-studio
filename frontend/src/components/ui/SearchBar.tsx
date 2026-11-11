import { Search, X } from 'lucide-react';
import './SearchBar.css';

/** The search field of the Vietsub lists: a search icon, the input, and a clear button while there is text. */
export function SearchBar({
  value,
  onChange,
  label,
  placeholder = label,
  onClear,
}: {
  value: string;
  onChange: (value: string) => void;
  /** The accessible name. */
  label: string;
  placeholder?: string;
  onClear: () => void;
}) {
  return (
    <div className="searchbar">
      <Search className="icon searchbar__icon" aria-hidden="true" />
      <input
        type="search"
        className="searchbar__input"
        placeholder={placeholder}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button className="button button--icon button--s button--ghost searchbar__clear" type="button" aria-label="Clear search" onClick={onClear}>
          <X className="icon" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
