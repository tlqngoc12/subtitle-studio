import userEvent from '@testing-library/user-event';
import { fanfic } from '../test/fanficFixtures';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { fakeFetch } from '../test/fakeFetch';
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
    const card = within(region).getByRole('link', { name: /Tình Yêu Mùa Hạ/ });
    expect(card).toHaveAttribute('href', '/novels/3');
    expect(within(card).getByText('Ongoing')).toBeInTheDocument();
    expect(within(card).getByText('12 chapters · 8 published')).toBeInTheDocument();
  });

  it('shows the total reads of each novel, or a dash when unavailable', async () => {
    fakeFetch([
      { method: 'GET', path: '/api/novels', status: 200, body: [novelSummary()] },
      { method: 'GET', path: '/api/novels/reads', status: 200, body: { [novelSummary().slug]: 1234 } },
    ]);
    const { unmount } = renderPage();

    const region = await loadedRegion('Novels');
    expect(await within(region).findByText('1,234 reads')).toBeInTheDocument();
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

  it('shows an empty state with the next step', async () => {
    fakeFetch([{ method: 'GET', path: '/api/novels', status: 200, body: [] }]);
    renderPage();

    const region = await loadedRegion('Novels');
    expect(within(region).getByText(/No novels yet/)).toBeInTheDocument();
  });

  it('shows the error when the list cannot load', async () => {
    fakeFetch([]);
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.');
  });

  it('uses singular words for one chapter', async () => {
    fakeFetch([
      { method: 'GET', path: '/api/novels', status: 200, body: [novelSummary({ chapterCount: 1, publishedCount: 0 })] },
    ]);
    renderPage();

    const region = await loadedRegion('Novels');
    expect(within(region).getByText('1 chapter · 0 published')).toBeInTheDocument();
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
