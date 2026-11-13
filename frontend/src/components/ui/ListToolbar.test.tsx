import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { optionNames, pickOption } from '../../test/select';
import { ListToolbar } from './ListToolbar';

function Harness() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'done'>('all');
  const [sort, setSort] = useState<'a' | 'b'>('a');
  return (
    <>
      <ListToolbar
        searchLabel="Search things"
        searchPlaceholder="Search by name…"
        query={query}
        onQueryChange={setQuery}
        statusLabel="Status"
        statuses={[
          { value: 'all', label: 'All' },
          { value: 'done', label: 'Done' },
        ]}
        status={status}
        onStatusChange={setStatus}
        sortId="things-sort"
        sortLabel="Sort by"
        sorts={[
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Beta' },
        ]}
        sort={sort}
        onSortChange={setSort}
        actions={<button type="button">Add</button>}
      />
      <output>{`${query}|${status}|${sort}`}</output>
    </>
  );
}

describe('ListToolbar', () => {
  it('has a search box with a descriptive placeholder and a short accessible name', async () => {
    render(<Harness />);
    const box = screen.getByRole('searchbox', { name: 'Search things' });
    expect(box).toHaveAttribute('placeholder', 'Search by name…');
    await userEvent.type(box, 'abc');
    expect(screen.getByRole('status')).toHaveTextContent('abc|all|a');
  });

  it('drives the status pills and the sort select, whose icon is decorative', async () => {
    const { container } = render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: 'Done' })).toHaveAttribute('aria-pressed', 'true');
    const user = userEvent.setup();
    await pickOption(user, screen.getByRole('combobox', { name: 'Sort by' }), 'Beta');
    expect(screen.getByRole('status')).toHaveTextContent('|done|b');
    expect(container.querySelector('.list-toolbar__sort-icon')).toHaveAttribute('aria-hidden', 'true');
    expect(await optionNames(user, screen.getByRole('combobox', { name: 'Sort by' }))).toEqual(['Alpha', 'Beta']);
  });

  it('renders the actions at the end', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });
});
