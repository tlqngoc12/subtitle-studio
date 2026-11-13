import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { answerConfirm } from '../test/confirm';
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

    expect(await screen.findByText(/No members yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add member' })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Ảnh banner' })).toBeInTheDocument();
  });

  it('keeps Add member and Edit at the standard header size', async () => {
    fakeFetch([GET_PAGE]);
    renderAt('/profiles');

    await screen.findByText('Trang của Emi');
    expect(screen.getByRole('button', { name: 'Add member' })).not.toHaveClass('button--s');
    expect(screen.getByRole('button', { name: 'Edit' })).not.toHaveClass('button--s');
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

    expect(await screen.findByText('Hãy kiểm tra kết nối mạng rồi thử lại.')).toBeInTheDocument();
    expect(screen.queryByText(/Subtitle Studio is running/)).not.toBeInTheDocument();
  });

  it('copes with data published before the banner existed', async () => {
    const old = { group: { slug: 'emibonnie', displayName: 'EmiBonnie', blocks: [] }, members: [] };
    renderPublic(old as never);

    expect(await screen.findByText('Chưa có gì ở đây, hãy quay lại sau nhé.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Ảnh banner' })).not.toBeInTheDocument();
  });
});

describe('ProfilePage edit mode', () => {
  const A = block({ id: 2, type: 'TEXT', body: 'Khối A' });
  const ADMIN_PAGE = page([profile('emi', 'Emi', [A]), BONNIE], profile('emibonnie', 'EmiBonnie', [], IMAGES));
  const GET: FakeRoute = { method: 'GET', path: '/api/profiles', status: 200, body: ADMIN_PAGE };

  async function openEditing(extra: FakeRoute[] = []) {
    const calls = fakeFetch([GET, ...extra]);
    renderAt('/profiles');
    await screen.findByText('Khối A');
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    return calls;
  }

  it('shows member and block tools only while editing', async () => {
    fakeFetch([GET]);
    renderAt('/profiles');
    await screen.findByText('Khối A');
    expect(screen.queryByRole('button', { name: 'Edit block' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Emi menu' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getAllByRole('button', { name: 'Edit block' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Emi menu' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Banner' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('button', { name: 'Edit block' })).not.toBeInTheDocument();
  });

  it('adds a member and shows the new section', async () => {
    const added = profile('any', 'Any', []);
    const calls = await openEditing([{ method: 'POST', path: '/api/profiles', status: 201, body: added }]);

    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));
    await userEvent.type(screen.getByLabelText('Member name'), 'Any');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add' }));

    expect(await screen.findByRole('region', { name: 'Any' })).toHaveClass('member--left');
    expect(JSON.parse(String(calls.find((c) => c.method === 'POST')?.body))).toEqual({ displayName: 'Any' });
  });

  it('deletes a member after confirming', async () => {
    const calls = await openEditing([{ method: 'DELETE', path: '/api/profiles/emi', status: 204 }]);

    await userEvent.click(screen.getByRole('button', { name: 'Emi menu' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete member' }));
    await answerConfirm('Delete member', 'Delete Emi?');

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Emi' })).not.toBeInTheDocument());
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
  });

  it('keeps the member when deletion is not confirmed', async () => {
    const calls = await openEditing();

    await userEvent.click(screen.getByRole('button', { name: 'Emi menu' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete member' }));
    await answerConfirm('Cancel');

    expect(screen.getByRole('region', { name: 'Emi' })).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
  });

  it('moves a member down', async () => {
    const reordered = [BONNIE, profile('emi', 'Emi', [A])];
    const calls = await openEditing([{ method: 'PUT', path: '/api/profiles/order', status: 200, body: reordered }]);

    await userEvent.click(screen.getByRole('button', { name: 'Emi menu' }));
    await userEvent.click(screen.getByRole('button', { name: 'Move down' }));

    await waitFor(() => {
      const ids = screen.getAllByRole('region', { name: /Emi|Bonnie/ }).map((s) => s.id);
      expect(ids).toEqual(['bonnie', 'emi']);
    });
    expect(JSON.parse(String(calls.find((c) => c.method === 'PUT')?.body))).toEqual({ slugs: ['bonnie', 'emi'] });
  });

  it('edits a block in place', async () => {
    const calls = await openEditing([
      { method: 'PUT', path: '/api/profiles/emi/blocks/2', status: 200, body: { ...A, body: 'Khối A đã sửa' } },
    ]);

    await userEvent.click(screen.getAllByRole('button', { name: 'Edit block' })[0]);
    const body = screen.getByLabelText('Content');
    await userEvent.clear(body);
    await userEvent.type(body, 'Khối A đã sửa');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Khối A đã sửa')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'PUT')).toBe(true);
  });

  it('adds a chips block to a member', async () => {
    const chips = block({ id: 7, type: 'CHIPS', items: [{ label: 'Reading', value: null, mediaId: null, mediaUrl: null }] });
    await openEditing([{ method: 'POST', path: '/api/profiles/emi/blocks', status: 201, body: chips }]);

    await userEvent.click(screen.getAllByRole('button', { name: 'Add block' })[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Chips' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add chip' }));
    await userEvent.type(screen.getByLabelText('Label'), 'Reading');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Reading')).toBeInTheDocument();
  });

  it('edits the header of a member', async () => {
    const saved = profile('emi', 'Emi', [A], [], { tagline: 'New tag' });
    await openEditing([{ method: 'PUT', path: '/api/profiles/emi/header', status: 200, body: saved }]);

    await userEvent.click(screen.getByRole('button', { name: 'Emi menu' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit header' }));
    await userEvent.type(screen.getByLabelText('Tagline'), 'New tag');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('New tag')).toBeInTheDocument();
  });
});
