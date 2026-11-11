import { Minus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import './NumberField.css';

interface Props {
  id?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min: number;
  max: number;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** A number input with − / + buttons inside the field. Empty is allowed (null); a typed value is clamped on blur. */
export function NumberField({ id, value, onChange, min, max, ...aria }: Props) {
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => {
    setText(value === null ? '' : String(value));
  }, [value]);

  function step(delta: number) {
    onChange(value === null ? min : clamp(value + delta, min, max));
  }

  return (
    <div className="number-field field-control">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className="number-field__input"
        value={text}
        {...aria}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '');
          setText(digits);
          onChange(digits === '' ? null : Number(digits));
        }}
        onBlur={() => {
          if (value !== null) {
            const next = clamp(value, min, max);
            setText(String(next));
            if (next !== value) onChange(next);
          }
        }}
      />
      <button
        type="button"
        className="button button--icon button--s button--ghost"
        aria-label="Decrease"
        disabled={value !== null && value <= min}
        onClick={() => step(-1)}
      >
        <Minus className="icon" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="button button--icon button--s button--ghost"
        aria-label="Increase"
        disabled={value !== null && value >= max}
        onClick={() => step(1)}
      >
        <Plus className="icon" aria-hidden="true" />
      </button>
    </div>
  );
}
