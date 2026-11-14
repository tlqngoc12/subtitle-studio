import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TagInput } from './TagInput';

const SUGGESTIONS = ['Romance', 'Drama', 'Dramedy', 'Fantasy'];

function Harness({
  initial = [],
  max,
  maxLength,
  onSubmit,
  onValue,
}: {
  initial?: string[];
  max?: number;
  maxLength?: number;
  onSubmit?: () => void;
  onValue?: (v: string[]) => void;
}) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
      }}
    >
      <label htmlFor="tags">Tags</label>
      <TagInput
        id="tags"
        value={value}
        onChange={(v) => {
          setValue(v);
          onValue?.(v);
        }}
        suggestions={SUGGESTIONS}
        max={max}
        maxLength={maxLength}
      />
    </form>
  );
}

const chips = () => screen.queryAllByRole('button', { name: /^Remove tag / }).map((b) => b.getAttribute('aria-label'));

describe('TagInput', () => {
  it('adds a tag on Enter without submitting the form', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    await user.type(screen.getByRole('combobox', { name: 'Tags' }), 'Romance{Enter}');

    expect(chips()).toEqual(['Remove tag Romance']);
    expect(screen.getByRole('combobox', { name: 'Tags' })).toHaveValue('');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('adds a tag on comma', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole('combobox', { name: 'Tags' }), 'Slow burn,');

    expect(chips()).toEqual(['Remove tag Slow burn']);
  });

  it('adds each tag of a pasted comma list: trimmed, empty dropped, deduped case-insensitively', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);

    await user.click(screen.getByRole('combobox', { name: 'Tags' }));
    await user.paste('a, b, , A');

    expect(chips()).toEqual(['Remove tag a', 'Remove tag b']);
    expect(onValue).toHaveBeenLastCalledWith(['a', 'b']);
  });

  it('ignores a tag that already exists, ignoring case', async () => {
    const user = userEvent.setup();
    render(<Harness initial={['Drama']} />);

    await user.type(screen.getByRole('combobox', { name: 'Tags' }), 'drama{Enter}');

    expect(chips()).toEqual(['Remove tag Drama']);
  });

  it('removes a tag with its x button', async () => {
    const user = userEvent.setup();
    render(<Harness initial={['Drama', 'Romance']} />);

    await user.click(screen.getByRole('button', { name: 'Remove tag Drama' }));

    expect(chips()).toEqual(['Remove tag Romance']);
  });

  it('removes the last tag with Backspace in an empty input, but not while there is text', async () => {
    const user = userEvent.setup();
    render(<Harness initial={['Drama', 'Romance']} />);
    const box = screen.getByRole('combobox', { name: 'Tags' });

    await user.type(box, 'x{Backspace}');
    expect(chips()).toHaveLength(2);
    await user.keyboard('{Backspace}');

    expect(chips()).toEqual(['Remove tag Drama']);
  });

  it('disables the input at max with a hint', async () => {
    render(<Harness initial={['a', 'b']} max={2} />);

    expect(screen.getByRole('combobox', { name: 'Tags' })).toBeDisabled();
    expect(screen.getByText('At most 2 tags.')).toBeInTheDocument();
  });

  it('says "At most 10 tags." with the default max', () => {
    render(<Harness initial={Array.from({ length: 10 }, (_, i) => `t${i}`)} />);

    expect(screen.getByText('At most 10 tags.')).toBeInTheDocument();
  });

  it('stops adding when a paste would pass the max', async () => {
    const user = userEvent.setup();
    render(<Harness max={2} />);

    await user.click(screen.getByRole('combobox', { name: 'Tags' }));
    await user.paste('a, b, c');

    expect(chips()).toEqual(['Remove tag a', 'Remove tag b']);
  });

  it('enforces maxLength on the input', async () => {
    const user = userEvent.setup();
    render(<Harness maxLength={5} />);
    const box = screen.getByRole('combobox', { name: 'Tags' });

    await user.type(box, 'abcdefgh');

    expect(box).toHaveValue('abcde');
  });

  it('filters suggestions while typing and hides tags already chosen', async () => {
    const user = userEvent.setup();
    render(<Harness initial={['Dramedy']} />);
    const box = screen.getByRole('combobox', { name: 'Tags' });

    await user.type(box, 'dram');

    const options = within(await screen.findByRole('listbox')).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Drama']);
  });

  it('picks a suggestion with the keyboard', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = screen.getByRole('combobox', { name: 'Tags' });

    await user.type(box, 'dram');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(chips()).toEqual(['Remove tag Drama']);
    expect(box).toHaveValue('');
  });

  it('picks a suggestion with the mouse', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = screen.getByRole('combobox', { name: 'Tags' });

    await user.click(box);
    await user.click(await screen.findByRole('option', { name: 'Fantasy' }));

    expect(chips()).toEqual(['Remove tag Fantasy']);
    expect(box).toHaveFocus();
  });

  it('adds text on blur so a typed tag is not lost', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Harness />
        <button type="button">elsewhere</button>
      </>,
    );

    await user.type(screen.getByRole('combobox', { name: 'Tags' }), 'Angst');
    await user.click(screen.getByRole('button', { name: 'elsewhere' }));

    expect(chips()).toEqual(['Remove tag Angst']);
  });
});
