import * as RadixSelect from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import './Select.css';

export interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  /** Goes on the trigger, so an existing `<label htmlFor={id}>` names it. */
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  /** `frame` is for the dark video frame (UrlForm). */
  variant?: 'default' | 'frame';
  /** Shown when `value` matches no option. */
  placeholder?: string;
  className?: string;
}

/** Radix Select items cannot have an empty value, so "" travels as this inside the component. */
const NONE = '__none__';
const toInternal = (value: string) => (value === '' ? NONE : value);
const fromInternal = (value: string) => (value === NONE ? '' : value);

/**
 * The shared dropdown (replaces native `<select>`): Radix Select with the app's look. Callers keep `""`
 * for "none"; it is mapped to an internal sentinel because Radix does not allow `value=""` on an item.
 */
export function Select({
  id,
  value,
  onChange,
  options,
  disabled,
  'aria-invalid': invalid,
  'aria-describedby': describedBy,
  variant = 'default',
  placeholder,
  className,
}: Props) {
  const known = options.some((o) => o.value === value);
  return (
    <RadixSelect.Root
      value={known ? toInternal(value) : ''}
      onValueChange={(v) => onChange(fromInternal(v))}
      disabled={disabled}
    >
      <RadixSelect.Trigger
        id={id}
        className={['select__trigger', `select__trigger--${variant}`, className].filter(Boolean).join(' ')}
        aria-invalid={invalid}
        aria-describedby={describedBy}
      >
        <span className="select__value">
          <RadixSelect.Value placeholder={placeholder} />
        </span>
        <RadixSelect.Icon asChild>
          <ChevronDown className="icon select__chevron" aria-hidden="true" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          className={`select__content select__content--${variant}`}
          position="popper"
          sideOffset={4}
          collisionPadding={8}
        >
          <RadixSelect.Viewport className="select__viewport">
            {options.map((o) => (
              <RadixSelect.Item key={o.value} className="select__item" value={toInternal(o.value)}>
                <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator className="select__check">
                  <Check className="icon icon--sm" aria-hidden="true" />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
