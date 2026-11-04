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
    expect(within(nav).getByRole('link', { name: 'Get Engsub' })).toHaveAttribute('href', '/');
    expect(within(nav).getByRole('link', { name: 'Vietsub' })).toHaveAttribute('href', '/vietsub');
    expect(within(nav).getByRole('link', { name: 'Vietsub list' })).toHaveAttribute('href', '/vietsub/list');
    expect(within(nav).getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/profiles');
  });

  it('links the app name to the home page', () => {
    render(
      <MemoryRouter initialEntries={['/profiles/emi']}>
        <NavBar />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Subtitle Studio' })).toHaveAttribute('href', '/');
  });

  it.each([
    ['/', 'Get Engsub'],
    ['/vietsub', 'Vietsub'],
    ['/vietsub/list', 'Vietsub list'],
    ['/vietsub/dQw4w9WgXcQ', 'Vietsub list'],
    ['/profiles', 'Profile'],
    ['/profiles/emi', 'Profile'],
  ])('marks exactly one current section at %s', (path, expected) => {
    expect(currentAt(path)).toEqual([expected]);
  });
  it.each(['/vietsub/playlists', '/vietsub/playlists/3', '/vietsub/playlists/3/'])(
    'marks Vietsub as current on the playlist pages (%s)',
    (path) => {
      expect(currentAt(path)).toEqual(['Vietsub']);
    },
  );

  it('still marks Vietsub list as current on the watch page', () => {
    expect(currentAt('/vietsub/abc')).toEqual(['Vietsub list']);
  });
});
