import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { css } from '../../test/css';
import { Select } from './Select';

const OPTIONS = [
  { value: '', label: 'None (off)' },
  { value: 'EmiBonnie', label: 'Emi & Bonnie' },
  { value: 'Other', label: 'Other' },
];

function Harness({
  initial = '',
  onChange = () => {},
  disabled,
}: {
  initial?: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div>
      <label htmlFor="pick">Pick one</label>
      <Select
        id="pick"
        value={value}
        options={OPTIONS}
        disabled={disabled}
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
      />
    </div>
  );
}

describe('Select', () => {
  it('is labelled by its <label htmlFor> and shows the selected label', () => {
    render(<Harness initial="EmiBonnie" />);

    const trigger = screen.getByLabelText('Pick one');
    expect(trigger).toHaveRole('combobox');
    expect(trigger).toHaveTextContent('Emi & Bonnie');
  });

  it('opens, lists the options and reports the picked value', async () => {
    const onChange = vi.fn();
    render(<Harness initial="EmiBonnie" onChange={onChange} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('combobox', { name: 'Pick one' }));
    const list = await screen.findByRole('listbox');
    expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual(['None (off)', 'Emi & Bonnie', 'Other']);
    expect(within(list).getByRole('option', { name: 'Emi & Bonnie' })).toHaveAttribute('aria-selected', 'true');

    await user.click(within(list).getByRole('option', { name: 'Other' }));

    expect(onChange).toHaveBeenCalledWith('Other');
    expect(screen.getByRole('combobox', { name: 'Pick one' })).toHaveTextContent('Other');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('works with the keyboard', async () => {
    const onChange = vi.fn();
    render(<Harness initial="EmiBonnie" onChange={onChange} />);
    const user = userEvent.setup();

    await user.tab();
    expect(screen.getByRole('combobox', { name: 'Pick one' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledWith('Other');
  });

  it('opens with ArrowDown on the closed trigger', async () => {
    render(<Harness initial="EmiBonnie" />);
    const user = userEvent.setup();

    await user.tab();
    await user.keyboard('{ArrowDown}');

    expect(await screen.findByRole('listbox')).toBeInTheDocument();
  });

  it('does not open when disabled', async () => {
    render(<Harness initial="EmiBonnie" disabled />);
    const trigger = screen.getByRole('combobox', { name: 'Pick one' });
    expect(trigger).toBeDisabled();

    await userEvent.setup().click(trigger);

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('keeps the empty string for an option with an empty value, in both directions', async () => {
    const onChange = vi.fn();
    render(<Harness initial="EmiBonnie" onChange={onChange} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('combobox', { name: 'Pick one' }));
    await user.click(await screen.findByRole('option', { name: 'None (off)' }));

    expect(onChange).toHaveBeenCalledWith('');
    expect(screen.getByRole('combobox', { name: 'Pick one' })).toHaveTextContent('None (off)');

    await user.click(screen.getByRole('combobox', { name: 'Pick one' }));
    expect(await screen.findByRole('option', { name: 'None (off)' })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows the empty option as selected when the value starts as an empty string', () => {
    render(<Harness initial="" />);

    expect(screen.getByRole('combobox', { name: 'Pick one' })).toHaveTextContent('None (off)');
  });

  it('shows the placeholder when no option matches the value', () => {
    render(
      <Select id="x" value="Gone" onChange={() => {}} options={[{ value: 'A', label: 'A' }]} placeholder="Choose…" />,
    );

    expect(screen.getByRole('combobox')).toHaveTextContent('Choose…');
  });

  it('passes aria-invalid and aria-describedby to the trigger', () => {
    render(
      <>
        <p id="hint">Hint</p>
        <Select id="x" value="A" onChange={() => {}} options={[{ value: 'A', label: 'A' }]} aria-invalid aria-describedby="hint" />
      </>,
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
    expect(trigger).toHaveAccessibleDescription('Hint');
  });

  it('uses only theme tokens for colours, brand purple for hover and the selected item', () => {
    const rule = (selector: string) =>
      new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^{]*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    expect(rule('.select__trigger')).toMatch(/border:\s*1px solid var\(--field-border\)/);
    expect(rule('.select__trigger:hover:not(:disabled)')).toMatch(/border-color:\s*var\(--brand-2\)/);
    expect(rule('.select__trigger:focus-visible')).toMatch(/outline:[^;]*var\(--focus\)/);
    expect(rule('.select__content')).toMatch(/background:\s*var\(--surface\)/);
    expect(rule('.select__content')).toMatch(/box-shadow:\s*var\(--shadow-overlay\)/);
    expect(rule('.select__item[data-highlighted]')).toMatch(/var\(--brand-2\)/);
    expect(rule('.select__check')).toMatch(/color:\s*var\(--brand-2-ink\)/);
    expect(rule('.select__trigger--frame:focus-visible')).toMatch(/var\(--brand-2\)/);
    expect(rule('.select__content--frame')).toMatch(/background:\s*var\(--frame\)/);
    expect(rule('.select__content--frame')).toMatch(/color:\s*var\(--on-frame\)/);
  });
});
