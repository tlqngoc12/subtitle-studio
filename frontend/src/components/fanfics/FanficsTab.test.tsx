import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import type { Fanfic } from '../../api/fanfics';
import { SiteProvider } from '../../data/SiteContext';
import { answerConfirm } from '../../test/confirm';
import { fakeFetch, problem, type Route as FakeRoute } from '../../test/fakeFetch';
import { fakeSource, publicSite } from '../../test/fakeSource';
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
    const search = screen.getByRole('searchbox', { name: 'Search fanfics' });

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
    expect(await screen.findByText('No fanfics match your search.')).toBeInTheDocument();
  });

  it('filters by status', async () => {
    renderPublic();
    await screen.findByRole('link', { name: /Second Spring/ });

    await userEvent.click(screen.getByRole('button', { name: 'Completed' }));
    expect(titles()).toEqual(['Chợ Đêm Mùa Hạ', 'Third Winter']);
    expect(screen.getByRole('button', { name: 'Completed' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Ongoing' }));
    expect(titles()).toEqual(['Second Spring']);

    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(titles()).toHaveLength(3);
  });

  it('sorts by update, reads, votes and date added', async () => {
    renderPublic();
    await screen.findByRole('link', { name: /Second Spring/ });
    const sort = screen.getByRole('combobox', { name: 'Sort by' });

    expect(await optionNames(userEvent.setup(), sort)).toEqual([
      'Newest update',
      'Most read',
      'Most voted',
      'Recently added',
    ]);
    await pickOption(userEvent.setup(), sort, 'Most read');
    expect(titles()).toEqual(['Second Spring', 'Chợ Đêm Mùa Hạ', 'Third Winter']);
    await pickOption(userEvent.setup(), sort, 'Most voted');
    expect(titles()).toEqual(['Third Winter', 'Chợ Đêm Mùa Hạ', 'Second Spring']);
    await pickOption(userEvent.setup(), sort, 'Recently added');
    expect(titles()).toEqual(['Third Winter', 'Chợ Đêm Mùa Hạ', 'Second Spring']);
    await pickOption(userEvent.setup(), sort, 'Newest update');
    expect(titles()).toEqual(['Second Spring', 'Chợ Đêm Mùa Hạ', 'Third Winter']);
  });

  it('puts a story without an update date last in Newest update', async () => {
    renderPublic([fanfic({ id: 5, title: 'Undated', storyUpdatedAt: null }), ...STORIES]);

    await screen.findByRole('link', { name: /Second Spring/ });
    expect(screen.getAllByRole('link').at(-1)).toHaveAccessibleName(/Undated/);
  });

  it('shows when the stats were last fetched', async () => {
    renderPublic();

    expect(await screen.findByText(/Stats from Wattpad, updated 11 Nov 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Stories © their authors/)).toBeInTheDocument();
  });

  it('shows an empty state without stories and no footer', async () => {
    renderPublic([]);

    expect(await screen.findByText('No fanfics yet.')).toBeInTheDocument();
    expect(screen.queryByText(/Stats from Wattpad/)).not.toBeInTheDocument();
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

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.');
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
});
