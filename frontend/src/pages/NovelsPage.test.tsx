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
