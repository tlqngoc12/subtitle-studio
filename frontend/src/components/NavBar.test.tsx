import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { NavBar } from './NavBar';

function currentAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <NavBar />
    </MemoryRouter>,
  );
  const nav = screen.getByRole('navigation');
  return within(nav)
    .getAllByRole('link')
    .filter((a) => a.getAttribute('aria-current') === 'page')
    .map((a) => a.textContent);
}

describe('NavBar', () => {
  it('links to the four sections', () => {
    render(
      <MemoryRouter>
        <NavBar />
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation');
    expect(within(nav).getByRole('link', { name: 'Lấy Engsub' })).toHaveAttribute('href', '/');
    expect(within(nav).getByRole('link', { name: 'Vietsub' })).toHaveAttribute('href', '/vietsub');
    expect(within(nav).getByRole('link', { name: 'Danh sách Vietsub' })).toHaveAttribute('href', '/vietsub/list');
    expect(within(nav).getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/profiles');
  });

  it.each([
    ['/', 'Lấy Engsub'],
    ['/vietsub', 'Vietsub'],
    ['/vietsub/list', 'Danh sách Vietsub'],
    ['/vietsub/dQw4w9WgXcQ', 'Danh sách Vietsub'],
    ['/profiles', 'Profile'],
    ['/profiles/emi', 'Profile'],
  ])('marks exactly one current section at %s', (path, expected) => {
    expect(currentAt(path)).toEqual([expected]);
  });
});
