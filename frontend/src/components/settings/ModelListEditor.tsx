import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { useId, useState } from 'react';
import { Combobox } from '../ui/Combobox';
import { IconButton } from '../ui/IconButton';
import './ModelListEditor.css';

interface Props {
  /** Ids the field label and the add box hang on. */
  id: string;
  models: string[];
  onChange: (models: string[]) => void;
  /** Model names offered while typing (the ones already listed are left out). */
  suggestions: string[];
  /** Names that cannot be added, such as the main model. */
  exclude?: string[];
  max?: number;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

/** An ordered list of model names: move up or down, remove, and add one with the shared Combobox (free text is fine). */
export function ModelListEditor({
  id,
  models,
  onChange,
  suggestions,
  exclude = [],
  max = 5,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: Props) {
  const addId = useId();
  const [draft, setDraft] = useState('');
  const name = draft.trim();
  const blocked = models.includes(name) || exclude.includes(name);
  const canAdd = name !== '' && !blocked && models.length < max;

  function add() {
    if (!canAdd) return;
    onChange([...models, name]);
    setDraft('');
  }

  function move(index: number, by: -1 | 1) {
    const next = [...models];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onChange(next);
  }

  return (
    <div className="model-list" id={id} role="group" aria-describedby={describedBy} aria-invalid={invalid || undefined}>
      {models.length === 0 ? (
        <p className="muted model-list__empty">No fallback models. Only the main model is asked.</p>
      ) : (
        <ol className="model-list__items">
          {models.map((model, i) => (
            <li key={model} className="model-list__item">
              <span className="model-list__order" aria-hidden="true">
                {i + 1}
              </span>
              <span className="model-list__name">{model}</span>
              <IconButton size="s" icon={ArrowUp} label={`Move ${model} up`} disabled={i === 0} onClick={() => move(i, -1)} />
              <IconButton
                size="s"
                icon={ArrowDown}
                label={`Move ${model} down`}
                disabled={i === models.length - 1}
                onClick={() => move(i, 1)}
              />
              <IconButton size="s" icon={X} label={`Remove ${model}`} onClick={() => onChange(models.filter((m) => m !== model))} />
            </li>
          ))}
        </ol>
      )}
      {models.length < max && (
        <div className="model-list__add">
          <label className="visually-hidden" htmlFor={addId}>
            Add a fallback model
          </label>
          <div className="model-list__box">
            <Combobox
              id={addId}
              value={draft}
              onChange={setDraft}
              suggestions={suggestions.filter((s) => !models.includes(s) && !exclude.includes(s))}
              placeholder="Add a fallback model"
            />
          </div>
          <button type="button" className="button" disabled={!canAdd} onClick={add}>
            <Plus className="icon" aria-hidden="true" />
            Add
          </button>
        </div>
      )}
    </div>
  );
}
