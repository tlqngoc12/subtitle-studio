import { answerConfirm } from '../test/confirm';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import { fakeFetch, problem, type Route as FakeRoute } from '../test/fakeFetch';
import { block, profile, SUMMARIES } from '../test/profileFixtures';
import type { BannerImage } from '../api/profiles';
import ProfilePage from './ProfilePage';
import { ApiError } from '../api/client';
import { SiteProvider } from '../data/SiteContext';
import { fakeSource, publicSite } from '../test/fakeSource';

function Location() {
  return <output aria-label="path">{useLocation().pathname}</output>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/profiles" element={<Navigate to="/profiles/emibonnie" replace />} />
        <Route path="/profiles/:slug" element={<ProfilePage />} />
      </Routes>
      <Location />
    </MemoryRouter>,
  );
}

const LIST: FakeRoute = { method: 'GET', path: '/api/profiles', status: 200, body: SUMMARIES };
const EMIBONNIE: FakeRoute = {
  method: 'GET',
  path: '/api/profiles/emibonnie',
  status: 200,
  body: profile('emibonnie', 'EmiBonnie', [block({ id: 1, type: 'TEXT', title: 'Giới thiệu', body: 'Cặp đôi GL' })]),
};
const EMI: FakeRoute = {
  method: 'GET',
  path: '/api/profiles/emi',
  status: 200,
  body: profile('emi', 'Emi', [block({ id: 2, type: 'TEXT', body: 'Trang của Emi' })]),
};

describe('ProfilePage', () => {
  it('opens EmiBonnie from /profiles', async () => {
    fakeFetch([LIST, EMIBONNIE]);
    renderAt('/profiles');

    expect(await screen.findByRole('heading', { level: 1, name: 'EmiBonnie' })).toBeInTheDocument();
    expect(screen.getByLabelText('path')).toHaveTextContent('/profiles/emibonnie');
    expect(await screen.findByText('Cặp đôi GL')).toBeInTheDocument();
  });

  it('switches profiles with the tabs', async () => {
    fakeFetch([LIST, EMIBONNIE, EMI]);
    renderAt('/profiles/emibonnie');
    const tabs = await screen.findByRole('navigation', { name: 'Profile' });
    expect(await within(tabs).findByRole('link', { name: 'EmiBonnie' })).toHaveAttribute('aria-current', 'page');
    // Same underline tabs as the Vietsub pages.
    expect(tabs).toHaveClass('tabs__list');
    // The bar and its content share one .tabs container (no negative-margin hack).
    expect(tabs.parentElement).toHaveClass('tabs');
    expect(tabs.nextElementSibling).toHaveClass('tabs__body');
    expect(within(tabs).getByRole('link', { name: 'Emi' })).toHaveClass('tabs__tab');

    await userEvent.click(within(tabs).getByRole('link', { name: 'Emi' }));

    expect(await screen.findByText('Trang của Emi')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Emi' })).toBeInTheDocument();
    expect(within(tabs).getByRole('link', { name: 'Emi' })).toHaveAttribute('aria-current', 'page');
  });

  it('explains an unknown profile', async () => {
    fakeFetch([
      LIST,
      { method: 'GET', path: '/api/profiles/nobody', status: 404, body: problem(404, 'PROFILE_NOT_FOUND', 'x') },
    ]);
    renderAt('/profiles/nobody');

    expect(await screen.findByText('Profile not found.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to EmiBonnie' })).toHaveAttribute('href', '/profiles/emibonnie');
  });

  it('reports a network error', async () => {
    fakeFetch([]);
    renderAt('/profiles/emi');

    expect(await screen.findByText('Cannot reach the server.')).toBeInTheDocument();
  });
});

describe('ProfilePage edit mode', () => {
  const A = block({ id: 1, type: 'TEXT', body: 'Khối A' });
  const B = block({ id: 2, type: 'TEXT', body: 'Khối B' });
  const PAGE: FakeRoute = {
    method: 'GET',
    path: '/api/profiles/emibonnie',
    status: 200,
    body: profile('emibonnie', 'EmiBonnie', [A, B]),
  };

  async function openEditing(extra: FakeRoute[] = []) {
    const calls = fakeFetch([LIST, PAGE, ...extra]);
    renderAt('/profiles/emibonnie');
    await screen.findByText('Khối B');
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    return calls;
  }

  const bodyOf = (calls: { body?: BodyInit | null }[], i: number) => JSON.parse(String(calls[i].body));

  it('shows block tools only while editing', async () => {
    fakeFetch([LIST, PAGE]);
    renderAt('/profiles/emibonnie');
    await screen.findByText('Khối B');
    expect(screen.queryByRole('button', { name: 'Edit block' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getAllByRole('button', { name: 'Edit block' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Delete block' })).toHaveLength(2);
    const up = screen.getAllByRole('button', { name: 'Move block up' });
    const down = screen.getAllByRole('button', { name: 'Move block down' });
    expect(up[0]).toBeDisabled();
    expect(up[1]).toBeEnabled();
    expect(down[0]).toBeEnabled();
    expect(down[1]).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('button', { name: 'Edit block' })).not.toBeInTheDocument();
  });

  it('adds a text block at the end', async () => {
    const created = block({ id: 3, type: 'TEXT', body: 'Khối mới' });
    const calls = await openEditing([
      { method: 'POST', path: '/api/profiles/emibonnie/blocks', status: 201, body: created },
    ]);

    await userEvent.click(screen.getByRole('button', { name: 'Add block' }));
    await userEvent.click(screen.getByRole('button', { name: 'Text' }));
    await userEvent.type(screen.getByLabelText('Content'), 'Khối mới');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Khối mới')).toBeInTheDocument();
    const post = calls.findIndex((c) => c.method === 'POST');
    expect(bodyOf(calls, post)).toMatchObject({ type: 'TEXT', body: 'Khối mới' });
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('edits a block in place', async () => {
    const calls = await openEditing([
      { method: 'PUT', path: '/api/profiles/emibonnie/blocks/1', status: 200, body: { ...A, body: 'Khối A đã sửa' } },
    ]);

    await userEvent.click(screen.getAllByRole('button', { name: 'Edit block' })[0]);
    const body = screen.getByLabelText('Content');
    expect(body).toHaveValue('Khối A');
    await userEvent.clear(body);
    await userEvent.type(body, 'Khối A đã sửa');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Khối A đã sửa')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'PUT')).toBe(true);
  });

  it('deletes a block after confirming', async () => {
    const calls = await openEditing([{ method: 'DELETE', path: '/api/profiles/emibonnie/blocks/1', status: 204 }]);

    await userEvent.click(screen.getAllByRole('button', { name: 'Delete block' })[0]);
    await answerConfirm('Delete', 'Delete this block?');

    await waitFor(() => expect(screen.queryByText('Khối A')).not.toBeInTheDocument());
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
  });

  it('keeps the block when deletion is not confirmed', async () => {
    const calls = await openEditing();

    await userEvent.click(screen.getAllByRole('button', { name: 'Delete block' })[0]);
    await answerConfirm('Cancel');

    expect(screen.getByText('Khối A')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
  });

  it('moves a block down', async () => {
    const calls = await openEditing([
      { method: 'POST', path: '/api/profiles/emibonnie/blocks/1/move', status: 200, body: [B, A] },
    ]);

    await userEvent.click(screen.getAllByRole('button', { name: 'Move block down' })[0]);

    await waitFor(() => {
      const texts = screen.getAllByText(/^Khối [AB]$/).map((el) => el.textContent);
      expect(texts).toEqual(['Khối B', 'Khối A']);
    });
    const move = calls.findIndex((c) => c.path.endsWith('/move'));
    expect(bodyOf(calls, move)).toEqual({ direction: 'DOWN' });
  });

  it('allows one open form at a time', async () => {
    await openEditing();

    await userEvent.click(screen.getAllByRole('button', { name: 'Edit block' })[0]);

    expect(screen.getByRole('button', { name: 'Edit block' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add block' })).toBeDisabled();
  });
});

describe('ProfilePage on the public site', () => {
  it('readOnlyEmptyProfileHasNoAdminHint', async () => {
    const source = fakeSource({
      listProfiles: async () => SUMMARIES,
      getProfile: async () => profile('bonnie', 'Bonnie', []),
    });
    render(
      <SiteProvider value={publicSite(source)}>
        <MemoryRouter initialEntries={['/profiles/bonnie']}>
          <Routes>
            <Route path="/profiles/:slug" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      </SiteProvider>,
    );

    expect(await screen.findByText('Nothing here yet — check back soon.')).toBeInTheDocument();
    expect(screen.queryByText(/Choose Edit/)).not.toBeInTheDocument();
  });

  it('readOnlyNetworkErrorHasNoAdminHint', async () => {
    const source = fakeSource({
      getProfile: () => Promise.reject(new ApiError(0, 'NETWORK', 'Failed to fetch')),
    });
    render(
      <SiteProvider value={publicSite(source)}>
        <MemoryRouter initialEntries={['/profiles/emi']}>
          <Routes>
            <Route path="/profiles/:slug" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      </SiteProvider>,
    );

    expect(await screen.findByText('Check your internet connection and try again.')).toBeInTheDocument();
    expect(screen.queryByText(/Subtitle Studio is running/)).not.toBeInTheDocument();
  });

  it('readOnlyHidesEditing', async () => {
    const source = fakeSource({
      listProfiles: async () => SUMMARIES,
      getProfile: async () => profile('emi', 'Emi', [block({ id: 2, type: 'TEXT', body: 'Trang của Emi' })]),
    });
    render(
      <SiteProvider value={publicSite(source)}>
        <MemoryRouter initialEntries={['/profiles/emi']}>
          <Routes>
            <Route path="/profiles/:slug" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      </SiteProvider>,
    );

    expect(await screen.findByText('Trang của Emi')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });
});

describe('ProfilePage banner', () => {
  const IMAGES: BannerImage[] = [
    { id: 1, mediaUrl: '/api/media/11', altText: 'Fan meeting' },
    { id: 2, mediaUrl: '/api/media/12', altText: null },
  ];
  const TEXT = block({ id: 1, type: 'TEXT', body: 'Khối A' });
  const page = (banner: BannerImage[]): FakeRoute => ({
    method: 'GET',
    path: '/api/profiles/emibonnie',
    status: 200,
    body: profile('emibonnie', 'EmiBonnie', [TEXT], banner),
  });

  it('has no banner element at all without images', async () => {
    fakeFetch([LIST, page([])]);
    renderAt('/profiles/emibonnie');
    await screen.findByText('Khối A');

    expect(screen.queryByRole('region', { name: 'Ảnh banner' })).not.toBeInTheDocument();
    expect(document.querySelector('.pbanner')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Banner' })).not.toBeInTheDocument();
  });

  it('shows the banner under the profile title and above the blocks', async () => {
    fakeFetch([LIST, page(IMAGES)]);
    renderAt('/profiles/emibonnie');
    const title = await screen.findByRole('heading', { level: 1, name: 'EmiBonnie' });
    const banner = await screen.findByRole('region', { name: 'Ảnh banner' });
    const blocks = screen.getByText('Khối A');

    expect(title.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(banner.compareDocumentPosition(blocks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(banner).getByRole('button', { name: 'Fan meeting' })).toBeInTheDocument();
  });

  it('adds the Banner section above the blocks only in edit mode', async () => {
    fakeFetch([LIST, page(IMAGES)]);
    renderAt('/profiles/emibonnie');
    await screen.findByText('Khối A');
    expect(screen.queryByRole('heading', { name: 'Banner' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const heading = screen.getByRole('heading', { name: 'Banner' });
    expect(heading.compareDocumentPosition(screen.getByText('Khối A')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('heading', { name: 'Banner' })).not.toBeInTheDocument();
  });

  it('shows a newly added image in the banner at once', async () => {
    const added = { id: 3, mediaUrl: '/api/media/50', altText: 'Photo shoot' };
    fakeFetch([
      LIST,
      page([]),
      { method: 'POST', path: '/api/media', status: 201, body: { id: 50, url: '/api/media/50' } },
      { method: 'POST', path: '/api/profiles/emibonnie/banner', status: 201, body: [added] },
    ]);
    renderAt('/profiles/emibonnie');
    await screen.findByText('Khối A');
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByRole('region', { name: 'Ảnh banner' })).not.toBeInTheDocument();

    await userEvent.upload(screen.getByLabelText('Choose image'), new File(['x'], 'a.png', { type: 'image/png' }));
    await screen.findByAltText('Selected image');
    await userEvent.type(screen.getByLabelText('Image description (optional)'), 'Photo shoot');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    const banner = await screen.findByRole('region', { name: 'Ảnh banner' });
    expect(within(banner).getByRole('button', { name: 'Photo shoot' })).toBeInTheDocument();
  });

  it('shows the banner on the public site with no editing controls', async () => {
    const source = fakeSource({
      listProfiles: async () => SUMMARIES,
      getProfile: async () => profile('emi', 'Emi', [block({ id: 2, type: 'TEXT', body: 'Trang của Emi' })], IMAGES),
    });
    render(
      <SiteProvider value={publicSite(source)}>
        <MemoryRouter initialEntries={['/profiles/emi']}>
          <Routes>
            <Route path="/profiles/:slug" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      </SiteProvider>,
    );

    const banner = await screen.findByRole('region', { name: 'Ảnh banner' });
    await userEvent.click(within(banner.querySelector('.filmstrip__row') as HTMLElement).getByRole('button', { name: 'Ảnh 2/2' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Banner' })).not.toBeInTheDocument();
  });

  it('copes with profile data published before the banner existed', async () => {
    const old = { slug: 'emi', displayName: 'Emi', updatedAt: '2026-11-03T10:00:00Z', blocks: [] } as never;
    const source = fakeSource({ listProfiles: async () => SUMMARIES, getProfile: async () => old });
    render(
      <SiteProvider value={publicSite(source)}>
        <MemoryRouter initialEntries={['/profiles/emi']}>
          <Routes>
            <Route path="/profiles/:slug" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      </SiteProvider>,
    );

    expect(await screen.findByText('Nothing here yet — check back soon.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Ảnh banner' })).not.toBeInTheDocument();
  });
});
