import { Users } from 'lucide-react';
import './PeopleFilter.css';
import { useT } from '../../lib/i18n';

export interface Person {
  slug: string;
  name: string;
  avatarUrl: string | null;
}

/**
 * Round-avatar filter: `All` plus one button per person; the chosen one has a purple ring (`aria-pressed`). Shared by
 * Photos and Works. `value` is a slug, or null for All.
 */
export function PeopleFilter({
  people,
  value,
  onChange,
}: {
  people: Person[];
  value: string | null;
  onChange: (slug: string | null) => void;
}) {
  const t = useT();
  return (
    <div className="people" role="group" aria-label={t('Filter by person', 'Lọc theo người')}>
      <button type="button" className="people__item" aria-pressed={value === null} onClick={() => onChange(null)}>
        <span className="people__avatar people__avatar--all" aria-hidden="true">
          <Users className="icon" />
        </span>
        <span className="people__name">{t('All', 'Tất cả')}</span>
      </button>
      {people.map((p) => (
        <button
          key={p.slug}
          type="button"
          className="people__item"
          aria-pressed={value === p.slug}
          onClick={() => onChange(p.slug)}
        >
          {p.avatarUrl ? (
            <img className="people__avatar" src={p.avatarUrl} alt="" />
          ) : (
            <span className="people__avatar people__avatar--initial" aria-hidden="true">
              {p.name.trim().charAt(0).toUpperCase()}
            </span>
          )}
          <span className="people__name">{p.name}</span>
        </button>
      ))}
    </div>
  );
}
