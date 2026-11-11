import { X } from 'lucide-react';
import { useId, type Dispatch, type SetStateAction } from 'react';
import type { FieldError } from '../../api/client';
import type { Person, WorkCategory } from '../../api/works';
import { Combobox } from '../ui/Combobox';
import { IconButton } from '../ui/IconButton';
import { SortableItem, SortableList } from '../ui/SortableList';
import { isFilm, roleSuggestions } from './categories';
import { PersonPicker } from './PersonPicker';
import './WorkEditor.css';

/** A credit as the editor holds it. */
export interface CreditRow {
  key: number;
  person: Person;
  role: string;
  characterName: string;
}

/**
 * The people rows of a work: `+ Person` (directory search / create), then per row the avatar, name, a role input with
 * suggestions for the categories, a character input (when Film and TV is a category) and Remove; drag the handle to reorder.
 */
export function CreditsEditor({
  value,
  categories,
  onChange,
  errors,
  newKey,
}: {
  value: CreditRow[];
  categories: WorkCategory[];
  onChange: Dispatch<SetStateAction<CreditRow[]>>;
  errors: FieldError[];
  newKey: () => number;
}) {
  const idPrefix = useId();
  const film = isFilm(categories);
  const errorOf = (path: string) => errors.find((e) => e.field === path)?.message;
  const patch = (key: number, p: Partial<CreditRow>) =>
    onChange((rows) => rows.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const hidingCharacters = !film && value.some((r) => r.characterName.trim() !== '');
  const roles = roleSuggestions(categories);

  return (
    <fieldset className="wed__group">
      <legend>People</legend>
      <div className="wed__quick">
        <PersonPicker
          exclude={value.map((r) => r.person.id)}
          onPick={(person) => onChange((rows) => [...rows, { key: newKey(), person, role: '', characterName: '' }])}
        />
      </div>
      {hidingCharacters && <p className="field__hint">Character names are removed for non-film works.</p>}

      <SortableList items={value} onChange={onChange}>
        {value.map((row, i) => {
          const p = `credits[${i}].`;
          const base = `${idPrefix}-${row.key}`;
          return (
            <SortableItem key={row.key} id={row.key} handleLabel={`Drag to reorder: ${row.person.name}`}>
              <div className="wed__row wed__row--person">
                {row.person.avatarUrl ? (
                  <img className="wed__avatar" src={row.person.avatarUrl} alt="" />
                ) : (
                  <span className="wed__avatar wed__avatar--initial" aria-hidden="true">
                    {row.person.name.trim().charAt(0).toUpperCase()}
                  </span>
                )}
                <strong className="wed__person-name">{row.person.name}</strong>
                <IconButton
                  label={`Remove ${row.person.name}`}
                  icon={X}
                  size="s"
                  onClick={() => onChange((rows) => rows.filter((r) => r.key !== row.key))}
                />
              </div>
              <div className="wed__row-fields">
                <div className="field">
                  <label htmlFor={`${base}-role`}>{`Role of ${row.person.name}`}</label>
                  <Combobox
                    id={`${base}-role`}
                    value={row.role}
                    suggestions={roles}
                    aria-invalid={errorOf(p + 'role') ? true : undefined}
                    onChange={(role) => patch(row.key, { role })}
                  />
                  {errorOf(p + 'role') && <p className="field__error">{errorOf(p + 'role')}</p>}
                </div>
                {film && (
                  <div className="field">
                    <label htmlFor={`${base}-character`}>{`Character of ${row.person.name}`}</label>
                    <input
                      id={`${base}-character`}
                      type="text"
                      value={row.characterName}
                      aria-invalid={errorOf(p + 'characterName') ? true : undefined}
                      onChange={(e) => patch(row.key, { characterName: e.target.value })}
                    />
                    {errorOf(p + 'characterName') && <p className="field__error">{errorOf(p + 'characterName')}</p>}
                  </div>
                )}
              </div>
              {errorOf(p + 'personId') && <p className="field__error">{errorOf(p + 'personId')}</p>}
            </SortableItem>
          );
        })}
      </SortableList>
      {errorOf('credits') && <p className="field__error">{errorOf('credits')}</p>}
    </fieldset>
  );
}
