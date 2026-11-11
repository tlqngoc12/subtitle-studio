import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PeopleFilter } from './PeopleFilter';

const PEOPLE = [
  { slug: 'emibonnie', name: 'EmiBonnie', avatarUrl: '/media/g.webp' },
  { slug: 'emi', name: 'Emi', avatarUrl: null },
];

describe('PeopleFilter', () => {
  it('marks All as pressed by default', () => {
    render(<PeopleFilter people={PEOPLE} value={null} onChange={() => {}} />);

    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Emi' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports the chosen person and All', async () => {
    const onChange = vi.fn();
    render(<PeopleFilter people={PEOPLE} value="emi" onChange={onChange} />);

    expect(screen.getByRole('button', { name: 'Emi' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'EmiBonnie' }));
    await userEvent.click(screen.getByRole('button', { name: 'All' }));

    expect(onChange.mock.calls).toEqual([['emibonnie'], [null]]);
  });
});
