import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SiteProvider } from '../data/SiteContext';
import { fakeSource, publicSite } from '../test/fakeSource';
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
  afterEach(() => vi.restoreAllMocks());

  it('scrolls the current section into view (phones show only part of the row)', () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
    render(
      <MemoryRouter initialEntries={['/profiles/emi']}>
        <NavBar />
      </MemoryRouter>,
    );

    expect(scroll).toHaveBeenCalledWith({ inline: 'center', block: 'nearest' });
    expect(scroll.mock.contexts[0]).toBe(screen.getByRole('link', { name: 'Profile' }));
  });

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

  it('lists the sections in order with Photos between Profile and Novels', () => {
    render(
      <MemoryRouter>
        <NavBar />
      </MemoryRouter>,
    );
    const links = within(screen.getByRole('navigation')).getAllByRole('link').map((a) => a.textContent);
    expect(links.slice(-6)).toEqual(['Vietsub', 'Vietsub list', 'Profile', 'Works', 'Photos', 'Novels']);
    expect(within(screen.getByRole('navigation')).getByRole('link', { name: 'Photos' })).toHaveAttribute('href', '/photos');
  });

  it('calls the list "Vietsub" on the public site and keeps it current on the list and watch pages', () => {
    const site = publicSite(fakeSource({}));
    render(
      <SiteProvider value={site}>
        <MemoryRouter initialEntries={['/vietsub/abc123']}>
          <NavBar />
        </MemoryRouter>
      </SiteProvider>,
    );
    const nav = screen.getByRole('navigation');
    const link = within(nav).getByRole('link', { name: 'Vietsub' });
    expect(link).toHaveAttribute('href', '/vietsub/list');
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(within(nav).queryByRole('link', { name: 'Vietsub list' })).not.toBeInTheDocument();
  });

  it('lists Novels after Photos and marks it current on chapter pages', () => {
    expect(currentAt('/novels/3/chapters/9')).toEqual(['Novels']);
    cleanup();
    expect(currentAt('/novels')).toEqual(['Novels']);
    const links = within(screen.getAllByRole('navigation')[0]).getAllByRole('link').map((a) => a.textContent);
    expect(links.indexOf('Novels')).toBe(links.indexOf('Photos') + 1);
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
    ['/photos', 'Photos'],
    ['/works', 'Works'],
    ['/works/3', 'Works'],
  ])('marks exactly one current section at %s', (path, expected) => {
    expect(currentAt(path)).toEqual([expected]);
  });
  it.each(['/vietsub/playlists', '/vietsub/playlists/3', '/vietsub/playlists/3/'])(
    'marks Vietsub as current on the playlist pages (%s)',
    (path) => {
      expect(currentAt(path)).toEqual(['Vietsub']);
    },
  );

  it.each(['/vietsub/profiles', '/vietsub/profiles/'])('marks Vietsub, not Vietsub list, at %s', (path) => {
    expect(currentAt(path)).toEqual(['Vietsub']);
  });

  it('marks no section on the Vietsub editor (unchanged)', () => {
    expect(currentAt('/vietsub/abc123/edit')).toEqual([]);
  });

  it('still marks Vietsub list as current on the watch page', () => {
    expect(currentAt('/vietsub/abc123')).toEqual(['Vietsub list']);
  });

  it('puts the logo (decorative, the name follows) before the app name in the brand link', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <NavBar />
      </MemoryRouter>,
    );

    const brand = screen.getByRole('link', { name: 'Subtitle Studio' });
    const logo = brand.querySelector('img');
    expect(logo).toHaveAttribute('src', '/logo.webp');
    expect(logo).toHaveAttribute('alt', '');
    expect(logo?.nextSibling?.textContent).toBe('Subtitle Studio');
  });
});
