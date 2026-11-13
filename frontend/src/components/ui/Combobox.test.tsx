import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Combobox } from './Combobox';

const SUGGESTIONS = ['Singer', 'Featuring', 'Vocal', 'MV cast'];

function Harness({ initial = '', onSubmit }: { initial?: string; onSubmit?: () => void }) {
  const [value, setValue] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
      }}
    >
      <label htmlFor="role">Role</label>
      <Combobox id="role" value={value} onChange={setValue} suggestions={SUGGESTIONS} />
    </form>
  );
}

describe('Combobox', () => {
  it('is a labelled combobox that starts closed and keeps free text', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const box = screen.getByRole('combobox', { name: 'Role' });
    expect(box).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.type(box, 'Director');

    expect(box).toHaveValue('Director');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens with every suggestion on click and filters while typing', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = screen.getByRole('combobox', { name: 'Role' });

    await user.click(box);
    expect(within(await screen.findByRole('listbox')).getAllByRole('option')).toHaveLength(4);
    expect(box).toHaveAttribute('aria-expanded', 'true');

    await user.type(box, 'voc');
    const options = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Vocal']);
  });

  it('renders the list in a portal under document.body, not inside the field', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);

    await user.click(screen.getByRole('combobox', { name: 'Role' }));
    const list = await screen.findByRole('listbox');

    expect(container.contains(list)).toBe(false);
    expect(document.body.contains(list)).toBe(true);
  });

  it('arrows move, Enter picks and closes', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = screen.getByRole('combobox', { name: 'Role' });

    await user.click(box);
    await user.keyboard('{ArrowDown}{ArrowDown}');
    const active = within(screen.getByRole('listbox')).getByRole('option', { name: 'Featuring' });
    expect(active).toHaveAttribute('aria-selected', 'true');
    expect(box).toHaveAttribute('aria-activedescendant', active.id);

    await user.keyboard('{Enter}');

    expect(box).toHaveValue('Featuring');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('ArrowUp wraps to the last suggestion, ArrowDown opens a closed list', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = screen.getByRole('combobox', { name: 'Role' });
    box.focus();

    await user.keyboard('{ArrowDown}');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('option', { name: 'MV cast' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Escape closes the list but keeps the text and does not bubble to a dialog', async () => {
    const user = userEvent.setup();
    const onKeyDown = vi.fn();
    render(
      <div onKeyDown={(e) => e.key === 'Escape' && onKeyDown()}>
        <Harness initial="Sin" />
      </div>,
    );
    const box = screen.getByRole('combobox', { name: 'Role' });

    await user.click(box);
    await user.type(box, 'g');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(box).toHaveValue('Sing');
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it('clicking an option picks it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = screen.getByRole('combobox', { name: 'Role' });

    await user.click(box);
    await user.click(await screen.findByRole('option', { name: 'MV cast' }));

    expect(box).toHaveValue('MV cast');
    expect(box).toHaveFocus();
  });

  it('Enter on free text that matches no suggestion keeps it and does not submit the form', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const box = screen.getByRole('combobox', { name: 'Role' });

    await user.type(box, 'Director{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
    expect(box).toHaveValue('Director');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('Enter with the list open but nothing highlighted keeps the text, closes the list and does not submit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const box = screen.getByRole('combobox', { name: 'Role' });

    await user.type(box, 'Sing');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
    expect(box).toHaveValue('Sing');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('Enter on a highlighted option does not submit the form', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    await user.click(screen.getByRole('combobox', { name: 'Role' }));
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: 'Role' })).toHaveValue('Singer');
  });

  it('shows no list when nothing matches', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole('combobox', { name: 'Role' }), 'zzz');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens on focus without typing when openOnFocus is set, and filters while typing', async () => {
    const user = userEvent.setup();
    render(<Combobox id="role" value="" onChange={() => {}} suggestions={SUGGESTIONS} openOnFocus />);

    await user.tab();

    expect(screen.getByRole('combobox')).toHaveFocus();
    expect(await screen.findAllByRole('option')).toHaveLength(SUGGESTIONS.length);
  });

  it('does not open on keyboard focus by default', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.tab();

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
