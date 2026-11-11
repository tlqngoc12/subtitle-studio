import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('DatePicker', () => {
  it('shows dd/MM/yyyy', () => {
    render(<DatePicker id="d" value="2026-11-09" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /09\/11\/2026/ })).toBeInTheDocument();
  });

  it('shows the placeholder when empty', () => {
    render(<DatePicker id="d" value={null} onChange={() => {}} placeholder="Coming Soon" />);
    expect(screen.getByRole('button', { name: /Coming Soon/ })).toBeInTheDocument();
  });

  it.each(['America/Los_Angeles', 'Asia/Bangkok'])('picking the 15th gives 2026-11-15 in %s', async (tz) => {
    vi.stubEnv('TZ', tz);
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DatePicker id="d" value="2026-11-09" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /09\/11\/2026/ }));
    const grid = await screen.findByRole('grid');
    await user.click(within(grid).getByRole('button', { name: /15/ }));
    expect(onChange).toHaveBeenCalledWith('2026-11-15');
  });

  it('Clear gives null and Today gives the local day', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DatePicker id="d" value="2026-11-09" onChange={onChange} clearable />);
    await user.click(screen.getByRole('button', { name: /09\/11\/2026/ }));
    await user.click(await screen.findByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    await user.click(screen.getByRole('button', { name: /09\/11\/2026/ }));
    await user.click(await screen.findByRole('button', { name: 'Today' }));
    expect(onChange).toHaveBeenLastCalledWith(toIsoDay(new Date()));
  });

  it('has no Clear button unless clearable', async () => {
    const user = userEvent.setup();
    render(<DatePicker id="d" value="2026-11-09" onChange={() => {}} />);
    await user.click(screen.getByRole('button', { name: /09\/11\/2026/ }));
    await screen.findByRole('grid');
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
  });

  it('Escape closes the calendar and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<DatePicker id="d" value="2026-11-09" onChange={() => {}} />);
    const trigger = screen.getByRole('button', { name: /09\/11\/2026/ });
    await user.click(trigger);
    await screen.findByRole('grid');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('forwards aria-invalid and aria-describedby to the trigger', () => {
    render(<DatePicker id="d" value={null} onChange={() => {}} aria-invalid aria-describedby="e" />);
    const trigger = screen.getByRole('button');
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
    expect(trigger).toHaveAttribute('aria-describedby', 'e');
  });
});
