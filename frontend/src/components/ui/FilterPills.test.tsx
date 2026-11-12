import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FilterPills } from './FilterPills';

const OPTIONS = [
  { value: null, label: 'All' },
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
] as { value: string | null; label: string }[];

describe('FilterPills', () => {
  it('renders a labelled group with the chosen pill pressed', () => {
    render(<FilterPills label="Filter things" options={OPTIONS} value="a" onChange={() => undefined} />);

    expect(screen.getByRole('group', { name: 'Filter things' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('presses All for null and reports the clicked value', async () => {
    const onChange = vi.fn();
    render(<FilterPills label="Filter things" options={OPTIONS} value={null} onChange={onChange} />);

    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Beta' }));
    expect(onChange).toHaveBeenCalledWith('b');
    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
