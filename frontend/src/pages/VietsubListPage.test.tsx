import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { VideoDto } from '../api/client';
import { fakeFetch } from '../test/fakeFetch';
import VietsubListPage from './VietsubListPage';

const ID = 'dQw4w9WgXcQ';

function video(id: string, title: string, viCueCount: number, viUpdatedAt: string | null): VideoDto {
  return {
    id,
    title,
    channel: 'Dev Channel',
    durationSec: 754,
    subLang: 'en',
    subSource: 'MANUAL',
    cueCount: 10,
    fetchedAt: '2026-11-02T09:00:00Z',
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    viCueCount,
    viUpdatedAt,
  };
}

const none = video('NONE0000001', 'Chưa có Vietsub', 0, null);
const older = video('OLDER000001', 'Video cũ hơn', 5, '2026-11-02T10:00:00Z');
const newer = video(ID, 'Học Spring Boot', 7, '2026-11-02T11:00:00Z');

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/vietsub/list']}>
      <Routes>
        <Route path="/vietsub/list" element={<VietsubListPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('VietsubListPage', () => {
  it('lists videos with Vietsub to watch, newest update first', async () => {
    fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [none, older, newer] }]);
    renderPage();

    const list = await screen.findByRole('region', { name: 'Danh sách Vietsub' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByRole('link', { name: /Học Spring Boot/ })).toHaveAttribute('href', `/vietsub/${ID}`);
    expect(within(items[0]).getByText('7 câu')).toBeInTheDocument();
    expect(within(items[1]).getByRole('link', { name: /Video cũ hơn/ })).toHaveAttribute('href', '/vietsub/OLDER000001');
  });

  it('has no replace or delete actions', async () => {
    fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [newer] }]);
    renderPage();

    const list = await screen.findByRole('region', { name: 'Danh sách Vietsub' });
    expect(within(list).queryByRole('button')).not.toBeInTheDocument();
    expect(within(list).queryByLabelText(/Thay Vietsub/)).not.toBeInTheDocument();
  });

  it('points to the Vietsub page when nothing has Vietsub yet', async () => {
    fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [none] }]);
    renderPage();

    expect(await screen.findByText(/Chưa có video nào có Vietsub/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Thêm Vietsub' })).toHaveAttribute('href', '/vietsub');
  });

  it('explains when the list cannot be loaded', async () => {
    fakeFetch([]);
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Không kết nối được máy chủ');
  });
});
