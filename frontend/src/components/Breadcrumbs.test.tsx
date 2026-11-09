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

  it('is styled as small muted text with thin separators and a current item in ink', () => {
    render(
      <MemoryRouter>
        <Breadcrumbs items={[{ label: 'Novels', to: '/novels' }, { label: 'Tên truyện', to: '/novels/x' }, { label: 'Chương 5' }]} />
      </MemoryRouter>,
    );

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav.querySelectorAll('.breadcrumbs__sep svg.icon--sm')).toHaveLength(2);
    expect(nav.querySelector('.breadcrumbs__item--current')).toHaveTextContent('Chương 5');
    expect(/\.breadcrumbs__list\s*\{[^}]*font-size:\s*var\(--step--1\)/.test(css)).toBe(true);
    expect(/\.breadcrumbs__item--current\s*\{[^}]*color:\s*var\(--ink\)[^}]*font-weight:\s*(600|700)/.test(css)).toBe(true);
    expect(/\.breadcrumbs__sep\s*\{[^}]*opacity|\.breadcrumbs__sep\s*\{[^}]*color:\s*var\(--muted\)/.test(css)).toBe(true);
    // Links turn brand orange on hover/focus and are underlined only on hover.
    expect(/a\.breadcrumbs__label:(hover|focus-visible)[^{]*\{[^}]*color:\s*var\(--brand/.test(css)).toBe(true);
    expect(/a\.breadcrumbs__label:hover[^{]*\{[^}]*text-decoration:\s*underline/.test(css)).toBe(true);
    // On narrow screens the current item keeps priority: the other items shrink first.
    expect(/\.breadcrumbs__item\s*\{[^}]*flex:\s*0 100 auto/.test(css)).toBe(true);
    expect(/\.breadcrumbs__item--current\s*\{[^}]*flex:\s*1 1 auto/.test(css)).toBe(true);
  });
});
