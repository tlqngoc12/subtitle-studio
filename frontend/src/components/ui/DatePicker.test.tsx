import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatePicker, fromIsoDay, toIsoDay } from './DatePicker';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('iso day helpers', () => {
  it.each(['America/Los_Angeles', 'Asia/Bangkok', 'UTC'])('round-trips without a shift in %s', (tz) => {
    vi.stubEnv('TZ', tz);
    expect(toIsoDay(fromIsoDay('2026-11-09'))).toBe('2026-11-09');
    expect(toIsoDay(fromIsoDay('2026-01-01'))).toBe('2026-01-01');
    expect(toIsoDay(fromIsoDay('2026-12-31'))).toBe('2026-12-31');
  });
});

const field = () => screen.getByRole('textbox');
const calendarButton = () => screen.getByRole('button', { name: 'Open calendar' });

describe('DatePicker', () => {
  it('shows dd/MM/yyyy in a text field', () => {
    render(<DatePicker id="d" value="2026-11-09" onChange={() => {}} />);
    expect(field()).toHaveValue('09/11/2026');
  });

  it('is empty with the dd/mm/yyyy placeholder when there is no value', () => {
    render(<DatePicker id="d" value={null} onChange={() => {}} />);
    expect(field()).toHaveValue('');
    expect(field()).toHaveAttribute('placeholder', 'dd/mm/yyyy');
  });

  it.each(['America/Los_Angeles', 'Asia/Bangkok'])('picking the 15th gives 2026-11-15 in %s', async (tz) => {
    vi.stubEnv('TZ', tz);
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DatePicker id="d" value="2026-11-09" onChange={onChange} />);
    await user.click(calendarButton());
    const grid = await screen.findByRole('grid');
    await user.click(within(grid).getByRole('button', { name: /15/ }));
    expect(onChange).toHaveBeenCalledWith('2026-11-15');
  });

  it('updates the text when a day is picked from the calendar', async () => {
    const user = userEvent.setup();
    function Host() {
      const [v, setV] = useState<string | null>('2026-11-09');
      return <DatePicker id="d" value={v} onChange={setV} />;
    }
    render(<Host />);
    await user.click(calendarButton());
    await user.click(within(await screen.findByRole('grid')).getByRole('button', { name: /15/ }));
    expect(field()).toHaveValue('15/11/2026');
  });

  it('Clear gives null and Today gives the local day', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DatePicker id="d" value="2026-11-09" onChange={onChange} clearable />);
    await user.click(calendarButton());
    await user.click(await screen.findByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    await user.click(calendarButton());
    await user.click(await screen.findByRole('button', { name: 'Today' }));
    expect(onChange).toHaveBeenLastCalledWith(toIsoDay(new Date()));
  });

  it('opens on a date far outside the usual year range', async () => {
    const user = userEvent.setup();
    render(<DatePicker id="d" value="1985-03-02" onChange={() => {}} />);
    await user.click(calendarButton());

    expect(await screen.findByRole('grid')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /year/i })).toHaveValue('1985');
  });

  it('has no Clear button unless clearable', async () => {
    const user = userEvent.setup();
    render(<DatePicker id="d" value="2026-11-09" onChange={() => {}} />);
    await user.click(calendarButton());
    await screen.findByRole('grid');
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
  });

  it('Escape closes the calendar and returns focus to the calendar button', async () => {
    const user = userEvent.setup();
    render(<DatePicker id="d" value="2026-11-09" onChange={() => {}} />);
    await user.click(calendarButton());
    await screen.findByRole('grid');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(calendarButton()).toHaveFocus();
  });

  it('forwards aria-invalid and aria-describedby to the field', () => {
    render(<DatePicker id="d" value={null} onChange={() => {}} aria-invalid aria-describedby="e" />);
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(field()).toHaveAttribute('aria-describedby', 'e');
  });

  it('renders the calendar through a portal under document.body, outside the field', async () => {
    const user = userEvent.setup();
    const { container } = render(<DatePicker id="d" value="2026-11-09" onChange={() => {}} />);
    await user.click(calendarButton());

    const grid = await screen.findByRole('grid');

    expect(container.contains(grid)).toBe(false);
    expect(grid.closest('.popover')?.parentElement?.parentElement).toBe(document.body);
  });

  describe('typing', () => {
    it.each([
      ['5/1/2026', '2026-01-05'],
      ['05-01-2026', '2026-01-05'],
      ['5.1.2026', '2026-01-05'],
    ])('commits %s as %s on blur', async (typed, iso) => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(<DatePicker id="d" value={null} onChange={onChange} />);
      await user.type(field(), typed);
      await user.tab();
      expect(onChange).toHaveBeenCalledWith(iso);
      expect(field()).toHaveValue('05/01/2026');
    });

    it('commits on Enter', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(<DatePicker id="d" value="2026-11-09" onChange={onChange} />);
      await user.clear(field());
      await user.type(field(), '20/11/2026{Enter}');
      expect(onChange).toHaveBeenCalledWith('2026-11-20');
    });

    it('keeps invalid text, shows an error and does not call onChange', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(<DatePicker id="d" value="2026-11-09" onChange={onChange} />);
      await user.clear(field());
      await user.type(field(), '31/02/2026');
      await user.tab();
      expect(onChange).not.toHaveBeenCalled();
      expect(field()).toHaveValue('31/02/2026');
      expect(field()).toHaveAttribute('aria-invalid', 'true');
      const error = screen.getByText('Enter a date as dd/mm/yyyy');
      expect(field().getAttribute('aria-describedby')).toContain(error.id);
    });

    it('an empty field calls onChange(null) when clearable', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(<DatePicker id="d" value="2026-11-09" onChange={onChange} clearable />);
      await user.clear(field());
      await user.tab();
      expect(onChange).toHaveBeenCalledWith(null);
    });

    it('an empty field goes back to the value when not clearable', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(<DatePicker id="d" value="2026-11-09" onChange={onChange} />);
      await user.clear(field());
      await user.tab();
      expect(onChange).not.toHaveBeenCalled();
      expect(field()).toHaveValue('09/11/2026');
    });

    it('Escape restores the last valid value and clears the error', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(<DatePicker id="d" value="2026-11-09" onChange={onChange} />);
      await user.clear(field());
      await user.type(field(), '99/99/2026{Enter}');
      expect(screen.getByText('Enter a date as dd/mm/yyyy')).toBeInTheDocument();
      await user.keyboard('{Escape}');
      expect(field()).toHaveValue('09/11/2026');
      expect(screen.queryByText('Enter a date as dd/mm/yyyy')).not.toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
