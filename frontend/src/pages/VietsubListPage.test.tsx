import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
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

/** `n` videos with Vietsub, "Video 01" updated most recently so it comes first. */
function many(n: number): VideoDto[] {
  return Array.from({ length: n }, (_, i) => {
    const num = String(i + 1).padStart(2, '0');
    return video(`VIDEO0000${num}`, `Video ${num}`, 5, `2026-11-02T10:${String(59 - i).padStart(2, '0')}:00Z`);
  });
}

function Location() {
  const { search } = useLocation();
  return <output aria-label="search">{search}</output>;
}

function renderPage(entry = '/vietsub/list') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/vietsub/list" element={<><VietsubListPage /><Location /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

const titles = (list: HTMLElement) =>
  within(within(list).getByRole('list')).getAllByRole('listitem').map((li) => within(li).getByText(/^Video \d+$/).textContent);

describe('VietsubListPage', () => {
  it('lists videos with Vietsub to watch, newest update first', async () => {
    fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [none, older, newer] }]);
    renderPage();

    const list = await screen.findByRole('region', { name: 'Danh sách Vietsub' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByRole('link', { name: /Học Spring Boot/ })).toHaveAttribute('href', `/vietsub/${ID}`);
    expect(within(list).queryByText(/câu/)).not.toBeInTheDocument();
    expect(within(items[1]).getByRole('link', { name: /Video cũ hơn/ })).toHaveAttribute('href', '/vietsub/OLDER000001');
  });

  it('has no replace or delete actions', async () => {
    fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [newer] }]);
    renderPage();

    const list = await screen.findByRole('region', { name: 'Danh sách Vietsub' });
    expect(within(list).queryByRole('button')).not.toBeInTheDocument();
    expect(within(list).queryByLabelText(/Replace Vietsub/)).not.toBeInTheDocument();
  });

  it('points to the Vietsub page when nothing has Vietsub yet', async () => {
    fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [none] }]);
    renderPage();

    expect(await screen.findByText(/Chưa có video nào có Vietsub/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Thêm Vietsub' })).toHaveAttribute('href', '/vietsub');
  });

  describe('pagination', () => {
    it('shows 10 videos per page with a pager', async () => {
      fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: many(23) }]);
      renderPage();

      const list = await screen.findByRole('region', { name: 'Danh sách Vietsub' });
      expect(titles(list)).toEqual(many(10).map((v) => v.title));
      const pager = within(list).getByRole('navigation', { name: 'Pagination' });
      expect(within(pager).getByRole('button', { name: 'Trang 1' })).toHaveAttribute('aria-current', 'page');
      expect(within(pager).getByRole('button', { name: 'Trang 3' })).toBeInTheDocument();
    });

    it('has no pager for 10 videos or fewer', async () => {
      fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: many(10) }]);
      renderPage();

      const list = await screen.findByRole('region', { name: 'Danh sách Vietsub' });
      expect(within(list).getAllByRole('listitem')).toHaveLength(10);
      expect(within(list).queryByRole('navigation')).not.toBeInTheDocument();
    });

    it('moves to another page and keeps it in the URL', async () => {
      fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: many(23) }]);
      renderPage();
      const list = await screen.findByRole('region', { name: 'Danh sách Vietsub' });
      const user = userEvent.setup();

      await user.click(within(list).getByRole('button', { name: 'Trang 2' }));
      expect(titles(list)[0]).toBe('Video 11');
      expect(screen.getByLabelText('search')).toHaveTextContent('?page=2');

      await user.click(within(list).getByRole('button', { name: 'Trang sau' }));
      expect(titles(list)).toEqual(['Video 21', 'Video 22', 'Video 23']);

      await user.click(within(list).getByRole('button', { name: 'Trang trước' }));
      expect(titles(list)[0]).toBe('Video 11');
    });

    it('opens on the page given in the URL', async () => {
      fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: many(23) }]);
      renderPage('/vietsub/list?page=3');

      const list = await screen.findByRole('region', { name: 'Danh sách Vietsub' });
      expect(titles(list)).toEqual(['Video 21', 'Video 22', 'Video 23']);
      expect(within(list).getByRole('button', { name: 'Trang 3' })).toHaveAttribute('aria-current', 'page');
    });

    it('shows the last page when the URL points past the end', async () => {
      fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: many(12) }]);
      renderPage('/vietsub/list?page=9');

      const list = await screen.findByRole('region', { name: 'Danh sách Vietsub' });
      expect(titles(list)).toEqual(['Video 11', 'Video 12']);
    });
  });

  it('explains when the list cannot be loaded', async () => {
    fakeFetch([]);
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Không kết nối được máy chủ');
  });
});
