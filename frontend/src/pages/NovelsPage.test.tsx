import userEvent from '@testing-library/user-event';
import { fanfic } from '../test/fanficFixtures';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { answerConfirm } from '../test/confirm';
import { fakeFetch } from '../test/fakeFetch';
import { pickOption } from '../test/select';
import { loadedRegion } from '../test/loadedRegion';
import { novelSummary } from '../test/novelFixtures';
import NovelsPage from './NovelsPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/novels']}>
      <NovelsPage />
    </MemoryRouter>,
  );
}

describe('NovelsPage', () => {
  it('shows a card per novel with status and chapter counts', async () => {
    fakeFetch([{ method: 'GET', path: '/api/novels', status: 200, body: [novelSummary()] }]);
    renderPage();

    const region = await loadedRegion('Novels');
    const card = await within(region).findByRole('link', { name: /Tình Yêu Mùa Hạ/ });
    expect(card).toHaveAttribute('href', '/novels/3');
    expect(within(card).getByText('Ongoing')).toBeInTheDocument();
    const value = (label: string) => within(card).getByText(label).closest('.fanfic-stat')?.querySelector('.fanfic-stat__value');
    expect(value('Chapters')).toHaveTextContent('12');
    expect(value('Published')).toHaveTextContent('8');
  });

  it('shows the total reads of each novel, or a dash when unavailable', async () => {
    fakeFetch([
      { method: 'GET', path: '/api/novels', status: 200, body: [novelSummary()] },
      { method: 'GET', path: '/api/novels/reads', status: 200, body: { [novelSummary().slug]: 1234 } },
    ]);
    const { unmount } = renderPage();

    const region = await loadedRegion('Novels');
    expect(await within(region).findByText('1.2K')).toBeInTheDocument();
    unmount();

    fakeFetch([
      { method: 'GET', path: '/api/novels', status: 200, body: [novelSummary()] },
      { method: 'GET', path: '/api/novels/reads', status: 200, body: {} },
    ]);
    renderPage();
    expect(await within(await loadedRegion('Novels')).findByText('–')).toBeInTheDocument();
  });

  it('links to the new novel form', async () => {
    fakeFetch([{ method: 'GET', path: '/api/novels', status: 200, body: [novelSummary()] }]);
    renderPage();

    expect(screen.getByRole('link', { name: 'New novel' })).toHaveAttribute('href', '/novels/new');
  });

  it('puts New novel in the Translated toolbar, not in the header', async () => {
    fakeFetch([{ method: 'GET', path: '/api/novels', status: 200, body: [novelSummary()] }]);
    renderPage();

    const newNovel = screen.getByRole('link', { name: 'New novel' });
    expect(newNovel).toHaveClass('button--primary');
    expect(newNovel.closest('.toolbar')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Novels' }).closest('header')).not.toContainElement(newNovel);
  });

  it('shows an empty state with the next step', async () => {
    fakeFetch([{ method: 'GET', path: '/api/novels', status: 200, body: [] }]);
    renderPage();

    const region = await loadedRegion('Novels');
    expect(await within(region).findByText(/No novels yet/)).toBeInTheDocument();
  });

  it('shows the error when the list cannot load', async () => {
    fakeFetch([]);
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.');
  });

});

describe('NovelsPage tabs', () => {
  const fanficsRoute = { method: 'GET', path: '/api/fanfics', status: 200, body: [fanfic({ title: 'Warm Story' })] };
  const novelsRoute = { method: 'GET', path: '/api/novels', status: 200, body: [novelSummary()] };

  function renderAt(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <NovelsPage />
      </MemoryRouter>,
    );
  }

  it('opens on Translated by default', async () => {
    fakeFetch([novelsRoute, fanficsRoute]);
    renderAt('/novels');

    expect(screen.getByRole('tab', { name: 'Translated' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('link', { name: /Tình Yêu Mùa Hạ/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New novel' })).toBeInTheDocument();
  });

  it('selects Fanfics from ?tab=fanfics', async () => {
    fakeFetch([novelsRoute, fanficsRoute]);
    renderAt('/novels?tab=fanfics');

    expect(screen.getByRole('tab', { name: 'Fanfics' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('link', { name: /Warm Story/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add fanfic' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'New novel' })).not.toBeInTheDocument();
  });

  it('switches tabs by clicking', async () => {
    fakeFetch([novelsRoute, fanficsRoute]);
    renderAt('/novels');

    await userEvent.click(screen.getByRole('tab', { name: 'Fanfics' }));
    expect(await screen.findByRole('link', { name: /Warm Story/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Translated' }));
    expect(await screen.findByRole('link', { name: /Tình Yêu Mùa Hạ/ })).toBeInTheDocument();
  });
});

describe('NovelsPage search, filter, sort and banner', () => {
  const NOVELS = [
    novelSummary({
      id: 1,
      slug: 'cho-dem',
      title: 'Chợ Đêm',
      originalAuthor: 'Minh Anh',
      novelStatus: 'COMPLETED',
      updatedAt: '2026-11-01T00:00:00Z',
      createdAt: '2026-10-01T00:00:00Z',
      featured: true,
    }),
    novelSummary({
      id: 2,
      slug: 'second-spring',
      title: 'Second Spring',
      originalAuthor: 'Rina',
      updatedAt: '2026-11-08T00:00:00Z',
      createdAt: '2026-10-20T00:00:00Z',
    }),
    novelSummary({
      id: 3,
      slug: 'winter',
      title: 'Winter',
      updatedAt: '2026-11-05T00:00:00Z',
      createdAt: '2026-10-10T00:00:00Z',
    }),
  ];
  const routes = [
    { method: 'GET', path: '/api/novels', status: 200, body: NOVELS },
    { method: 'GET', path: '/api/novels/reads', status: 200, body: { winter: 900, 'second-spring': 10 } },
  ];

  const titles = () =>
    within(screen.getByRole('list', { name: 'Novel list' }))
      .getAllByRole('listitem')
      .map((li) => within(li).getByRole('link', { name: /./ }).textContent ?? '');

  it('searches accent-insensitively and says when nothing matches', async () => {
    fakeFetch(routes);
    renderPage();
    await screen.findByRole('link', { name: /Second Spring/ });

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search novels' }), 'cho dem');
    expect(screen.getByRole('link', { name: /Chợ Đêm/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Second Spring/ })).not.toBeInTheDocument();

    await userEvent.clear(screen.getByRole('searchbox', { name: 'Search novels' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search novels' }), 'zzz');
    expect(screen.getByText('No novels match.')).toBeInTheDocument();
  });

  it('filters by status with the pills', async () => {
    fakeFetch(routes);
    renderPage();
    await screen.findByRole('link', { name: /Second Spring/ });

    await userEvent.click(screen.getByRole('button', { name: 'Completed' }));
    expect(screen.getByRole('button', { name: 'Completed' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('link', { name: /Chợ Đêm/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Winter/ })).not.toBeInTheDocument();
  });

  it('sorts by newest update, most read, recently added and title', async () => {
    fakeFetch(routes);
    renderPage();
    await screen.findByRole('link', { name: /Second Spring/ });
    const sort = () => screen.getByRole('combobox', { name: 'Sort by' });
    const user = userEvent.setup();

    expect(titles().map((t) => t.slice(0, 6))).toEqual(['Second', 'Winter', 'Chợ Đê']);
    await pickOption(user, sort(), 'Most read');
    await waitFor(() => expect(titles().map((t) => t.slice(0, 6))).toEqual(['Winter', 'Second', 'Chợ Đê']));
    await pickOption(user, sort(), 'Recently added');
    await waitFor(() => expect(titles().map((t) => t.slice(0, 6))).toEqual(['Second', 'Winter', 'Chợ Đê']));
    await pickOption(user, sort(), 'Title A–Z');
    await waitFor(() => expect(titles().map((t) => t.slice(0, 6))).toEqual(['Chợ Đê', 'Second', 'Winter']));
  });

  it('shows the banner badge on picked novels and the menu action matches', async () => {
    fakeFetch(routes);
    renderPage();
    await screen.findByRole('link', { name: /Second Spring/ });

    expect(screen.getAllByText('On banner')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Menu for Chợ Đêm' }));
    expect(screen.getByRole('button', { name: 'Remove from banner' })).toBeInTheDocument();
  });

  it('alerts instead of calling the API when 5 novels are on the banner', async () => {
    const many = [1, 2, 3, 4, 5].map((i) => novelSummary({ id: i, slug: `p${i}`, title: `Picked ${i}`, featured: true }));
    const calls = fakeFetch([
      { method: 'GET', path: '/api/novels', status: 200, body: [...many, novelSummary({ id: 9, slug: 'extra', title: 'Extra One' })] },
    ]);
    renderPage();
    await screen.findByRole('link', { name: /Extra One/ });

    await userEvent.click(screen.getByRole('button', { name: 'Menu for Extra One' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add to banner' }));
    await answerConfirm('OK', 'Banner is full');
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });
});
