import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import type { Fanfic } from '../../api/fanfics';
import { SiteProvider } from '../../data/SiteContext';
import { answerConfirm } from '../../test/confirm';
import { fakeFetch, problem, type Route as FakeRoute } from '../../test/fakeFetch';
import { fakeSource, publicSite } from '../../test/fakeSource';
import { expectTooltip } from '../../test/tooltip';
import { fanfic } from '../../test/fanficFixtures';
import { optionNames, pickOption } from '../../test/select';
import { FanficsTab } from './FanficsTab';

vi.mock('sonner', async (orig) => ({ ...(await orig<typeof import('sonner')>()), toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

beforeEach(() => {
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.message).mockClear();
});

const STORIES: Fanfic[] = [
  fanfic({
    id: 1,
    title: 'Chợ Đêm Mùa Hạ',
    author: 'minhanh',
    tags: ['gl', 'summer'],
    readCount: 500,
    voteCount: 90,
    completed: true,
    storyUpdatedAt: '2026-10-01T06:00:00Z',
    createdAt: '2026-11-05T06:00:00Z',
    fetchedAt: '2026-11-09T06:00:00Z',
  }),
  fanfic({
    id: 2,
    title: 'Second Spring',
    author: 'rina',
    tags: ['fluff'],
    readCount: 9000,
    voteCount: 10,
    completed: false,
    storyUpdatedAt: '2026-11-03T06:00:00Z',
    createdAt: '2026-11-01T06:00:00Z',
    fetchedAt: '2026-11-11T06:00:00Z',
  }),
  fanfic({
    id: 3,
    title: 'Third Winter',
    author: 'sam',
    tags: ['angst'],
    readCount: 70,
    voteCount: 800,
    completed: true,
    storyUpdatedAt: '2026-08-01T06:00:00Z',
    createdAt: '2026-11-08T06:00:00Z',
    fetchedAt: '2026-11-10T06:00:00Z',
  }),
];

const titles = () => screen.getAllByRole('link').map((l) => /Chợ Đêm Mùa Hạ|Second Spring|Third Winter/.exec(l.textContent ?? '')?.[0]);

function renderPublic(list: Fanfic[] = STORIES) {
  const site = publicSite(fakeSource({ listFanfics: async () => list }));
  return render(
    <SiteProvider value={site}>
      <MemoryRouter>
        <FanficsTab />
      </MemoryRouter>
    </SiteProvider>,
  );
}

describe('FanficsTab (public)', () => {
  it('lists the newest story update first and shows no admin controls', async () => {
    renderPublic();

    await screen.findByRole('link', { name: /Second Spring/ });
    expect(titles()).toEqual(['Second Spring', 'Chợ Đêm Mùa Hạ', 'Third Winter']);
    expect(screen.queryByRole('button', { name: 'Add fanfic' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refresh all' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Menu for/ })).not.toBeInTheDocument();
  });

  it('searches title, author and tags without accents', async () => {
    renderPublic();
    await screen.findByRole('link', { name: /Second Spring/ });
    const search = screen.getByRole('searchbox', { name: 'Tìm fanfic' });

    await userEvent.type(search, 'cho dem');
    expect(titles()).toEqual(['Chợ Đêm Mùa Hạ']);

    await userEvent.clear(search);
    await userEvent.type(search, 'RINA');
    expect(titles()).toEqual(['Second Spring']);

    await userEvent.clear(search);
    await userEvent.type(search, 'angst');
    expect(titles()).toEqual(['Third Winter']);

    await userEvent.clear(search);
    await userEvent.type(search, 'nothing like this');
    expect(await screen.findByText('Không có fanfic nào khớp với tìm kiếm.')).toBeInTheDocument();
  });

  it('filters by status', async () => {
    renderPublic();
    await screen.findByRole('link', { name: /Second Spring/ });

    await userEvent.click(screen.getByRole('button', { name: 'Hoàn thành' }));
    expect(titles()).toEqual(['Chợ Đêm Mùa Hạ', 'Third Winter']);
    expect(screen.getByRole('button', { name: 'Hoàn thành' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Đang ra' }));
    expect(titles()).toEqual(['Second Spring']);

    await userEvent.click(screen.getByRole('button', { name: 'Tất cả' }));
    expect(titles()).toHaveLength(3);
  });

  it('sorts by update, reads, votes and date added', async () => {
    renderPublic();
    await screen.findByRole('link', { name: /Second Spring/ });
    const sort = screen.getByRole('combobox', { name: 'Sắp xếp theo' });

    expect(await optionNames(userEvent.setup(), sort)).toEqual([
      'Mới cập nhật',
      'Đọc nhiều nhất',
      'Bình chọn nhiều nhất',
      'Mới thêm',
    ]);
    await pickOption(userEvent.setup(), sort, 'Đọc nhiều nhất');
    expect(titles()).toEqual(['Second Spring', 'Chợ Đêm Mùa Hạ', 'Third Winter']);
    await pickOption(userEvent.setup(), sort, 'Bình chọn nhiều nhất');
    expect(titles()).toEqual(['Third Winter', 'Chợ Đêm Mùa Hạ', 'Second Spring']);
    await pickOption(userEvent.setup(), sort, 'Mới thêm');
    expect(titles()).toEqual(['Third Winter', 'Chợ Đêm Mùa Hạ', 'Second Spring']);
    await pickOption(userEvent.setup(), sort, 'Mới cập nhật');
    expect(titles()).toEqual(['Second Spring', 'Chợ Đêm Mùa Hạ', 'Third Winter']);
  });

  it('puts a story without an update date last in Mới cập nhật', async () => {
    renderPublic([fanfic({ id: 5, title: 'Undated', storyUpdatedAt: null }), ...STORIES]);

    await screen.findByRole('link', { name: /Second Spring/ });
    expect(screen.getAllByRole('link').at(-1)).toHaveAccessibleName(/Undated/);
  });

  it('shows when the stats were last fetched', async () => {
    renderPublic();

    expect(await screen.findByText(/Số liệu từ Wattpad, cập nhật 11[/]11[/]2026/)).toBeInTheDocument();
    expect(screen.getByText(/Truyện thuộc bản quyền tác giả/)).toBeInTheDocument();
  });

  it('shows an empty state without stories and no footer', async () => {
    renderPublic([]);

    expect(await screen.findByText('Chưa có fanfic nào.')).toBeInTheDocument();
    expect(screen.queryByText(/Số liệu từ Wattpad/)).not.toBeInTheDocument();
  });

  it('shows the error when the list cannot be loaded', async () => {
    const site = publicSite(fakeSource({ listFanfics: () => Promise.reject(new Error('boom')) }));
    render(
      <SiteProvider value={site}>
        <MemoryRouter>
          <FanficsTab />
        </MemoryRouter>
      </SiteProvider>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Đã xảy ra lỗi.');
  });
});

describe('FanficsTab (admin)', () => {
  const GET: FakeRoute = { method: 'GET', path: '/api/fanfics', status: 200, body: STORIES };
  const URL = 'https://www.wattpad.com/story/396487502-the-way-she-warmed-me-emibonnie';

  function renderAdmin(outerSubmit?: () => void) {
    const tab = (
      <MemoryRouter>
        <FanficsTab />
      </MemoryRouter>
    );
    return render(outerSubmit ? <form onSubmit={outerSubmit}>{tab}</form> : tab);
  }

  async function openDialog() {
    await userEvent.click(screen.getByRole('button', { name: 'Add fanfic' }));
    return screen.findByRole('dialog', { name: 'Add fanfic' });
  }

  it('shows Add fanfic, Refresh all and a menu on every card', async () => {
    fakeFetch([GET]);
    renderAdmin();

    await screen.findByRole('link', { name: /Second Spring/ });
    expect(screen.getByRole('button', { name: 'Add fanfic' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh all' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Menu for/ })).toHaveLength(3);
  });

  it('shows Refresh all as an icon button with a tooltip, no visible text', async () => {
    fakeFetch([GET]);
    renderAdmin();

    await screen.findByRole('link', { name: /Second Spring/ });
    const refresh = screen.getByRole('button', { name: 'Refresh all' });
    expect(refresh).toHaveClass('button--icon');
    expect(refresh).toHaveTextContent('');
    await expectTooltip(refresh, 'Refresh all');
  });

  it('orders the toolbar search, status pills, sort, Refresh all, Add fanfic', async () => {
    fakeFetch([GET]);
    renderAdmin();

    await screen.findByRole('link', { name: /Second Spring/ });
    const items = [
      screen.getByRole('searchbox'),
      screen.getByRole('group', { name: 'Status' }),
      screen.getByRole('combobox'),
      screen.getByRole('button', { name: 'Refresh all' }),
      screen.getByRole('button', { name: 'Add fanfic' }),
    ];
    for (let i = 0; i < items.length - 1; i++) {
      expect(items[i].compareDocumentPosition(items[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(items[0].closest('.toolbar')).not.toBeNull();
    expect(items[4].closest('.toolbar')).toBe(items[0].closest('.toolbar'));
  });

  it('adds a story: Fetch shows the preview, Save puts the card in the list', async () => {
    const preview = { ...fanfic({ id: 7, title: 'Warm Story' }), id: null, createdAt: null };
    const saved = fanfic({ id: 7, title: 'Warm Story', storyUpdatedAt: '2026-11-20T06:00:00Z' });
    const calls = fakeFetch([
      GET,
      { method: 'POST', path: '/api/fanfics/preview', status: 200, body: preview },
      { method: 'POST', path: '/api/fanfics', status: 201, body: saved },
    ]);
    renderAdmin();
    await screen.findByRole('link', { name: /Second Spring/ });

    const dialog = await openDialog();
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText('Wattpad story link'), URL);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fetch' }));

    expect(await within(dialog).findByRole('link', { name: /Warm Story/ })).toBeInTheDocument();
    expect(JSON.parse(String(calls.find((c) => c.path === '/api/fanfics/preview')?.body))).toEqual({ url: URL });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAccessibleName(/Warm Story/);
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Fanfic added');
  });

  it.each([
    [400, 'INVALID_FANFIC_LINK', 'Use the story link (wattpad.com/story/…), not a chapter link.', 'Use the story link (wattpad.com/story/…), not a chapter link.'],
    [404, 'FANFIC_NOT_FOUND', 'Story not found or not public.', 'Story not found or not public.'],
    [409, 'FANFIC_EXISTS', 'This story is already added as “Old”.', 'This story is already added as “Old”.'],
    [502, 'WATTPAD_UNAVAILABLE', 'Wattpad did not answer. Try again later.', 'Wattpad did not answer. Try again later.'],
  ])('shows the %i error under the link field', async (status, code, detail, shown) => {
    fakeFetch([GET, { method: 'POST', path: '/api/fanfics/preview', status, body: problem(status, code, detail) }]);
    renderAdmin();
    await screen.findByRole('link', { name: /Second Spring/ });

    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText('Wattpad story link'), URL);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fetch' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(shown);
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('does not submit a form around the page when the dialog form is submitted', async () => {
    const outer = vi.fn((e: Event) => e.preventDefault());
    fakeFetch([GET, { method: 'POST', path: '/api/fanfics/preview', status: 200, body: { ...fanfic(), id: null, createdAt: null } }]);
    renderAdmin(() => outer(new Event('submit')));
    await screen.findByRole('link', { name: /Second Spring/ });

    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText('Wattpad story link'), `${URL}{Enter}`);

    expect(await within(dialog).findByRole('link', { name: /The Way She Warmed Me/ })).toBeInTheDocument();
    expect(outer).not.toHaveBeenCalled();
  });

  it('refreshes one story from its menu and replaces the card', async () => {
    const calls = fakeFetch([
      GET,
      { method: 'POST', path: '/api/fanfics/2/refresh', status: 200, body: { ...STORIES[1], title: 'Second Spring (renamed)', readCount: 12345 } },
    ]);
    renderAdmin();
    await screen.findByRole('link', { name: /Second Spring/ });

    await userEvent.click(screen.getByRole('button', { name: 'Menu for Second Spring' }));
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByRole('link', { name: /Second Spring \(renamed\)/ })).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST' && c.path === '/api/fanfics/2/refresh')).toBe(true);
    expect(screen.getByText('12.3K')).toBeInTheDocument();
  });

  it('shows the error when one refresh fails and keeps the card', async () => {
    fakeFetch([GET, { method: 'POST', path: '/api/fanfics/2/refresh', status: 404, body: problem(404, 'FANFIC_NOT_FOUND', 'Story not found or not public.') }]);
    renderAdmin();
    await screen.findByRole('link', { name: /Second Spring/ });

    await userEvent.click(screen.getByRole('button', { name: 'Menu for Second Spring' }));
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Story not found or not public.');
    expect(screen.getByRole('link', { name: /Second Spring/ })).toBeInTheDocument();
  });

  it('refreshes all, toasts the counts and lists the failures', async () => {
    const calls = fakeFetch([
      GET,
      {
        method: 'POST',
        path: '/api/fanfics/refresh',
        status: 200,
        body: { updated: 2, failed: [{ id: 3, title: 'Third Winter', message: 'Story not found or not public.' }] },
      },
    ]);
    renderAdmin();
    await screen.findByRole('link', { name: /Second Spring/ });

    await userEvent.click(screen.getByRole('button', { name: 'Refresh all' }));

    await waitFor(() => expect(vi.mocked(toast.message)).toHaveBeenCalledWith('Updated 2 · Failed 1'));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Third Winter');
    expect(alert).toHaveTextContent('Story not found or not public.');
    expect(calls.filter((c) => c.path === '/api/fanfics' && c.method === 'GET')).toHaveLength(2);
  });

  it('toasts a plain success when nothing failed', async () => {
    fakeFetch([GET, { method: 'POST', path: '/api/fanfics/refresh', status: 200, body: { updated: 3, failed: [] } }]);
    renderAdmin();
    await screen.findByRole('link', { name: /Second Spring/ });

    await userEvent.click(screen.getByRole('button', { name: 'Refresh all' }));

    await waitFor(() => expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Updated 3 · Failed 0'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('deletes a story after confirming', async () => {
    const calls = fakeFetch([GET, { method: 'DELETE', path: '/api/fanfics/2', status: 204 }]);
    renderAdmin();
    await screen.findByRole('link', { name: /Second Spring/ });

    await userEvent.click(screen.getByRole('button', { name: 'Menu for Second Spring' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await answerConfirm('Delete', 'Delete “Second Spring”?');

    await waitFor(() => expect(screen.queryByRole('link', { name: /Second Spring/ })).not.toBeInTheDocument());
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
  });

  describe('Translate this story', () => {
    function renderWithRoutes() {
      render(
        <MemoryRouter initialEntries={['/novels']}>
          <Routes>
            <Route path="/novels" element={<FanficsTab />} />
            <Route path="/novels/new" element={<NewStub />} />
            <Route path="/novels/:id" element={<p>novel page</p>} />
          </Routes>
        </MemoryRouter>,
      );
    }

    function NewStub() {
      const { search } = useLocation();
      return <p>new novel {decodeURIComponent(search)}</p>;
    }

    it('opens New novel on From Wattpad with the story link', async () => {
      fakeFetch([
        { method: 'GET', path: '/api/fanfics', status: 200, body: STORIES.slice(0, 1) },
        { method: 'GET', path: '/api/novels', status: 200, body: [] },
      ]);
      renderWithRoutes();
      await screen.findByRole('link', { name: /Chợ Đêm/ });

      await userEvent.click(screen.getByRole('button', { name: /^Menu for Chợ Đêm/ }));
      await userEvent.click(await screen.findByRole('link', { name: 'Translate this story' }));

      expect(await screen.findByText('new novel ?wattpad=https://www.wattpad.com/story/396487502')).toBeInTheDocument();
    });

    it('offers Open translation when a novel already uses the story', async () => {
      fakeFetch([
        { method: 'GET', path: '/api/fanfics', status: 200, body: STORIES.slice(0, 1) },
        { method: 'GET', path: '/api/novels', status: 200, body: [{ id: 41, wattpadStoryId: '396487502' }] },
      ]);
      renderWithRoutes();
      await screen.findByRole('link', { name: /Chợ Đêm/ });

      await waitFor(async () => {
        await userEvent.click(screen.getByRole('button', { name: /^Menu for Chợ Đêm/ }));
        expect(await screen.findByRole('link', { name: 'Open translation' })).toHaveAttribute('href', '/novels/41');
      });
      expect(screen.queryByRole('link', { name: 'Translate this story' })).not.toBeInTheDocument();
    });

    it('still offers Translate this story when the novels cannot be listed', async () => {
      fakeFetch([{ method: 'GET', path: '/api/fanfics', status: 200, body: STORIES.slice(0, 1) }]);
      renderWithRoutes();
      await screen.findByRole('link', { name: /Chợ Đêm/ });

      await userEvent.click(screen.getByRole('button', { name: /^Menu for Chợ Đêm/ }));

      expect(await screen.findByRole('link', { name: 'Translate this story' })).toBeInTheDocument();
    });

    it('the public site has no menu at all', async () => {
      renderPublic();
      await screen.findByRole('link', { name: /Second Spring/ });

      expect(screen.queryByRole('link', { name: 'Translate this story' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Menu for/ })).not.toBeInTheDocument();
    });
  });
});
