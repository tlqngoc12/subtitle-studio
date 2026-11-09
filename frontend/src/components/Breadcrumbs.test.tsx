import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { Breadcrumbs } from './Breadcrumbs';

const css = Object.values(import.meta.glob('../styles.css', { query: '?raw', import: 'default', eager: true })).join('');

describe('Breadcrumbs', () => {
  it('links every crumb but the last, which is the current page', () => {
    render(
      <MemoryRouter>
        <Breadcrumbs items={[{ label: 'Novels', to: '/novels' }, { label: 'Tất cả truyện' }]} />
      </MemoryRouter>,
    );

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(nav).getAllByRole('link')).toHaveLength(1);
    expect(within(nav).getByText('Tất cả truyện')).toHaveAttribute('aria-current', 'page');
    expect(nav.querySelectorAll('svg')).toHaveLength(1);
    expect(nav.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('truncates long titles with an ellipsis', () => {
    const rule = /\.breadcrumbs__label\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/text-overflow:\s*ellipsis/);
    expect(rule).toMatch(/overflow:\s*hidden/);
    expect(rule).toMatch(/white-space:\s*nowrap/);
  });
});
