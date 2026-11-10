import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import type { BannerImage } from '../api/profiles';
import { SiteProvider } from '../data/SiteContext';
import { fakeFetch, type Route as FakeRoute } from '../test/fakeFetch';
import { fakeSource, publicSite } from '../test/fakeSource';
import { block, page, profile } from '../test/profileFixtures';
import ProfilePage, { ProfileRedirect } from './ProfilePage';

function Location() {
  return <output aria-label="path">{useLocation().pathname + useLocation().hash}</output>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/profiles" element={<ProfilePage />} />
        <Route path="/profiles/:slug" element={<ProfileRedirect />} />
      </Routes>
      <Location />
    </MemoryRouter>,
  );
}

function renderPublic(data: ReturnType<typeof page> | Promise<never>, path = '/profiles') {
  const source = fakeSource({ getProfilePage: () => Promise.resolve(data as never) });
  return render(
    <SiteProvider value={publicSite(source)}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/profiles" element={<ProfilePage />} />
          <Route path="/profiles/:slug" element={<ProfileRedirect />} />
        </Routes>
        <Location />
      </MemoryRouter>
    </SiteProvider>,
  );
}

const IMAGES: BannerImage[] = [
  { id: 1, mediaUrl: '/api/media/11', altText: 'Fan meeting' },
  { id: 2, mediaUrl: '/api/media/12', altText: null },
];

const EMI = profile('emi', 'Emi', [block({ id: 2, type: 'TEXT', body: 'Trang của Emi' })], [], {
  tagline: 'Mimi',
});
const BONNIE = profile('bonnie', 'Bonnie', [block({ id: 3, type: 'TEXT', body: 'Trang của Bonnie' })]);
const PAGE = page([EMI, BONNIE], profile('emibonnie', 'EmiBonnie', [], IMAGES));
const GET_PAGE: FakeRoute = { method: 'GET', path: '/api/profiles', status: 200, body: PAGE };

afterEach(() => {
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

describe('ProfilePage', () => {
  it('shows the banner and the members in order with alternating sides', async () => {
    fakeFetch([GET_PAGE]);
    renderAt('/profiles');

    expect(await screen.findByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument();
    const banner = await screen.findByRole('region', { name: 'Ảnh banner' });
    const sections = await screen.findAllByRole('region', { name: /Emi|Bonnie/ });
    expect(sections.map((s) => s.id)).toEqual(['emi', 'bonnie']);
    expect(sections[0]).toHaveClass('member--left');
    expect(sections[1]).toHaveClass('member--right');
    expect(banner.compareDocumentPosition(sections[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(sections[0]).getByText('Trang của Emi')).toBeInTheDocument();
    expect(within(sections[0]).getByText('Mimi')).toBeInTheDocument();
  });

  it('opens an old /profiles/emi link at #emi and scrolls to it after loading', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    fakeFetch([GET_PAGE]);
    renderAt('/profiles/emi');

    await screen.findByText('Trang của Emi');
    expect(screen.getByLabelText('path')).toHaveTextContent('/profiles#emi');
    expect(scrollIntoView).toHaveBeenCalled();
    expect((scrollIntoView.mock.contexts[0] as HTMLElement).id).toBe('emi');
  });

  it('sends the group link /profiles/emibonnie to /profiles', async () => {
    fakeFetch([GET_PAGE]);
    renderAt('/profiles/emibonnie');

    await screen.findByText('Trang của Emi');
    expect(screen.getByLabelText('path')).toHaveTextContent(/^\/profiles$/);
  });

  it('renders the page for an unknown member link and ignores the hash', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    fakeFetch([GET_PAGE]);
    renderAt('/profiles/unknown');

    expect(await screen.findByText('Trang của Emi')).toBeInTheDocument();
    expect(screen.getByLabelText('path')).toHaveTextContent('/profiles#unknown');
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('shows the banner and an empty state when no members are left', async () => {
    fakeFetch([{ ...GET_PAGE, body: page([], PAGE.group) }]);
    renderAt('/profiles');

    expect(await screen.findByText('Nothing here yet — check back soon.')).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Ảnh banner' })).toBeInTheDocument();
  });

  it('reports a network error', async () => {
    fakeFetch([]);
    renderAt('/profiles');

    expect(await screen.findByText('Cannot reach the server.')).toBeInTheDocument();
  });
});

describe('ProfilePage on the public site', () => {
  it('shows the page without any editing controls', async () => {
    renderPublic(PAGE);

    expect(await screen.findByText('Trang của Emi')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add member' })).not.toBeInTheDocument();
  });

  it('readOnlyNetworkErrorHasNoAdminHint', async () => {
    const source = fakeSource({ getProfilePage: () => Promise.reject(new ApiError(0, 'NETWORK', 'Failed to fetch')) });
    render(
      <SiteProvider value={publicSite(source)}>
        <MemoryRouter initialEntries={['/profiles']}>
          <Routes>
            <Route path="/profiles" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      </SiteProvider>,
    );

    expect(await screen.findByText('Check your internet connection and try again.')).toBeInTheDocument();
    expect(screen.queryByText(/Subtitle Studio is running/)).not.toBeInTheDocument();
  });

  it('copes with data published before the banner existed', async () => {
    const old = { group: { slug: 'emibonnie', displayName: 'EmiBonnie', blocks: [] }, members: [] };
    renderPublic(old as never);

    expect(await screen.findByText('Nothing here yet — check back soon.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Ảnh banner' })).not.toBeInTheDocument();
  });
});
