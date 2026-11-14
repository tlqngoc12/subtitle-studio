import * as Popover from '@radix-ui/react-popover';
import { X } from 'lucide-react';
import { useId, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { PopoverPanel } from './PopoverPanel';
import './Combobox.css'; // the suggestion list shares Combobox's look
import './TagInput.css';

interface Props {
  id: string;
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
  max?: number;
  maxLength?: number;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

/** Adds the non-empty, trimmed parts that are not there yet (case-insensitive), up to `max`. */
function merge(current: string[], parts: string[], max: number, maxLength: number): string[] {
  const next = [...current];
  for (const part of parts) {
    const tag = part.trim().slice(0, maxLength);
    if (!tag || next.length >= max) continue;
    if (next.some((t) => t.toLowerCase() === tag.toLowerCase())) continue;
    next.push(tag);
  }
  return next;
}

/**
 * Tags as chips with an input and a suggestion list. Enter, comma and blur add the typed text (a pasted comma list adds
 * each part); Backspace in an empty input removes the last chip. Duplicates are ignored without regard to case.
 */
export function TagInput({
  id,
  value,
  onChange,
  suggestions,
  max = 10,
  maxLength = 40,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: Props) {
  const listId = useId();
  const hintId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const full = value.length >= max;
  const needle = text.trim().toLowerCase();
  const options = suggestions.filter(
    (s) => !value.some((t) => t.toLowerCase() === s.toLowerCase()) && (!needle || s.toLowerCase().includes(needle)),
  );
  const visible = open && !full && options.length > 0;
  const optionId = (i: number) => `${listId}-${i}`;

  function close() {
    setOpen(false);
    setActive(-1);
  }

  function add(parts: string[]) {
    const next = merge(value, parts, max, maxLength);
    if (next.length !== value.length) onChange(next);
    setText('');
    close();
  }

  function onInput(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    if (raw.includes(',')) {
      add(raw.split(','));
      return;
    }
    setText(raw.slice(0, maxLength));
    setActive(-1);
    setOpen(true);
  }

  function move(step: 1 | -1) {
    if (!visible) {
      setOpen(true);
      setActive(step === 1 ? 0 : options.length - 1);
      return;
    }
    const next = active + step;
    const wrapped = next < 0 ? options.length - 1 : next >= options.length ? 0 : next;
    setActive(wrapped);
    document.getElementById(optionId(wrapped))?.scrollIntoView?.({ block: 'nearest' });
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      move(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault(); // never submit the form around the field
      if (visible && active >= 0) add([options[active]]);
      else add([text]);
    } else if (e.key === 'Backspace' && !text && value.length > 0) {
      onChange(value.slice(0, -1));
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      close();
    }
  }

  return (
    <div className="tag-input">
      <Popover.Root open={visible} onOpenChange={(o) => !o && close()}>
        <Popover.Anchor asChild>
          <div
            className="tag-input__box"
            data-invalid={invalid || undefined}
            onClick={() => input.current?.focus()}
          >
            {value.map((tag) => (
              <span key={tag} className="badge tag-input__chip">
                {tag}
                <button
                  type="button"
                  className="tag-input__remove"
                  aria-label={`Remove tag ${tag}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(value.filter((t) => t !== tag));
                    input.current?.focus();
                  }}
                >
                  <X className="icon icon--sm" aria-hidden="true" />
                </button>
              </span>
            ))}
            <input
              ref={input}
              id={id}
              type="text"
              role="combobox"
              className="tag-input__input"
              autoComplete="off"
              aria-autocomplete="list"
              aria-expanded={visible}
              aria-controls={visible ? listId : undefined}
              aria-activedescendant={visible && active >= 0 ? optionId(active) : undefined}
              aria-invalid={invalid || undefined}
              aria-describedby={[describedBy, full ? hintId : undefined].filter(Boolean).join(' ') || undefined}
              disabled={full}
              maxLength={maxLength}
              value={text}
              onChange={onInput}
              onClick={() => !full && setOpen(true)}
              onBlur={() => {
                if (text.trim()) add([text]);
                else close();
              }}
              onKeyDown={onKeyDown}
            />
          </div>
        </Popover.Anchor>
        <PopoverPanel
          className="tag-input__panel"
          role="presentation"
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (input.current?.parentElement?.contains(e.target as Node)) e.preventDefault();
          }}
        >
          <ul id={listId} role="listbox" aria-label="Suggestions" className="combobox__list">
            {options.map((option, i) => (
              <li
                key={option}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                className="combobox__option"
                onMouseDown={(e) => e.preventDefault()} // keep the focus in the input
                onMouseMove={() => setActive(i)}
                onClick={() => {
                  add([option]);
                  input.current?.focus();
                }}
              >
                {option}
              </li>
            ))}
          </ul>
        </PopoverPanel>
      </Popover.Root>
      {full && (
        <p className="field__hint" id={hintId}>
          At most {max} tags.
        </p>
      )}
    </div>
  );
}
