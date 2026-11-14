import { act, cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SiteProvider } from '../data/SiteContext';
import { fakeSource, publicSite } from '../test/fakeSource';
import { centredScrollLeft, NavBar } from './NavBar';
import { css } from '../test/css';

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

  describe('centredScrollLeft', () => {
    const nav = { clientWidth: 300, scrollWidth: 800 };
    it('centres a middle item', () => {
      expect(centredScrollLeft({ offsetLeft: 400, offsetWidth: 100 }, nav)).toBe(300);
    });
    it('clamps the first item to 0', () => {
      expect(centredScrollLeft({ offsetLeft: 10, offsetWidth: 60 }, nav)).toBe(0);
    });
    it('clamps the last item to the maximum', () => {
      expect(centredScrollLeft({ offsetLeft: 700, offsetWidth: 90 }, nav)).toBe(500);
    });
    it('rounds to whole pixels', () => {
      expect(centredScrollLeft({ offsetLeft: 401, offsetWidth: 101 }, nav)).toBe(302);
    });
  });

  it('centres the current section with scrollLeft, never scrollIntoView (Safari), and again once fonts load', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    let loaded: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      loaded = resolve;
    });
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready } });
    const restores: Array<() => unknown> = [];
    const dims: Record<string, number> = { offsetLeft: 400, offsetWidth: 100, clientWidth: 300, scrollWidth: 800 };
    for (const key of Object.keys(dims)) {
      // jsdom has no layout: report the stubbed size for every element (restored with the other spies below).
      const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, key) ?? Object.getOwnPropertyDescriptor(Element.prototype, key);
      Object.defineProperty(HTMLElement.prototype, key, { configurable: true, get: () => dims[key] });
      restores.push(() => (original ? Object.defineProperty(HTMLElement.prototype, key, original) : Reflect.deleteProperty(HTMLElement.prototype, key)));
    }
    render(
      <MemoryRouter initialEntries={['/profiles/emi']}>
        <NavBar />
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation');
    expect(nav.scrollLeft).toBe(300);

    // Widths change when the web font arrives.
    dims.offsetLeft = 420;
    loaded();
    await act(async () => {
      await ready;
    });
    expect(nav.scrollLeft).toBe(320);
    expect(scrollIntoView).not.toHaveBeenCalled();
    Reflect.deleteProperty(document, 'fonts');
    restores.forEach((restore) => restore());
  });

  it('fades the row edges over 32px so a half-cut word does not look broken', () => {
    expect(css).toMatch(/\.nav\[data-fade-end='true'\] \{[^}]*calc\(100% - 32px\)/);
    expect(css).toMatch(/\.nav\[data-fade-start='true'\] \{[^}]*calc\(100% - 32px\)/);
    expect(css).toMatch(/\.nav\[data-fade-start='true'\]\[data-fade-end='true'\] \{[^}]*#000 32px/);
  });

  it('centres the current section instead of snapping, so no hard-cut fragment is left', () => {
    expect(/\.nav \{[^}]*scroll-snap/.test(css)).toBe(false);
    expect(/\.nav__link \{[^}]*scroll-snap/.test(css)).toBe(false);
  });

  it('fades only the edges that have more items behind them', () => {
    // A left fade only once scrolled, a right fade only while more is to the right; nothing from 761px.
    expect(css).toMatch(/\.nav\[data-fade-start='true'\]/);
    expect(css).toMatch(/\.nav\[data-fade-end='true'\]/);
    expect(css).toMatch(/\.nav\[data-fade-start='true'\]\[data-fade-end='true'\]/);
  });

  it('marks the row as fading at the right edge on mount (nothing is scrolled yet)', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <NavBar />
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation');
    expect(nav).toHaveAttribute('data-fade-start');
    expect(nav).toHaveAttribute('data-fade-end');
  });

  it('keeps the app name reachable when only the logo shows on phones', () => {
    render(
      <MemoryRouter>
        <NavBar />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Subtitle Studio' })).toBeInTheDocument();
    expect(css).toMatch(/\.topbar__name\s*\{[^}]*clip/);
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
