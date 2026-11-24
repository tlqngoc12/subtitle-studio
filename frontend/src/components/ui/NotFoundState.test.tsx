import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { NotFoundState } from './NotFoundState';

describe('NotFoundState', () => {
  it('has an H1, breadcrumbs that end in the list and "Not found", and a link back', () => {
    render(
      <MemoryRouter>
        <NotFoundState
          title="Video not found"
          crumbs={[{ label: 'Vietsub', to: '/vietsub' }, { label: 'List', to: '/vietsub/list' }]}
          backTo="/vietsub/list"
          backLabel="Back to the list"
        >
          Nothing here.
        </NotFoundState>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Video not found' })).toBeInTheDocument();
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'List' })).toHaveAttribute('href', '/vietsub/list');
    expect(within(crumbs).getByText('Not found')).toBeInTheDocument();
    expect(screen.getByText('Nothing here.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the list' })).toHaveAttribute('href', '/vietsub/list');
  });
});
