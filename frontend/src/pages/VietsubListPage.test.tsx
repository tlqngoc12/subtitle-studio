import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import { loadedRegion } from '../test/loadedRegion';
import type { VideoDto } from '../api/client';
import { fakeFetch, type Route as FakeRoute } from '../test/fakeFetch';
import { detail, summary, vsVideo } from '../test/playlistFixtures';
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
    viSource: viCueCount > 0 ? 'MANUAL' : null,
    translationStatus: null,
    translationError: null,
    translationProfile: null,
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

function WatchStub() {
  const { pathname, search, state } = useLocation();
  return <p>watch {pathname + search} autoplay={String((state as { autoplay?: boolean } | null)?.autoplay)}</p>;
}

function renderPage(entry = '/vietsub/list') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/vietsub/list" element={<><VietsubListPage /><Location /></>} />
        <Route path="/vietsub/:id" element={<WatchStub />} />
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

    const list = await loadedRegion('Vietsub list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByRole('link', { name: /Học Spring Boot/ })).toHaveAttribute('href', `/vietsub/${ID}`);
    expect(within(list).queryByText(/lines/)).not.toBeInTheDocument();
    expect(within(items[1]).getByRole('link', { name: /Video cũ hơn/ })).toHaveAttribute('href', '/vietsub/OLDER000001');
  });

  it('has no replace or delete actions', async () => {
    fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [newer] }]);
    renderPage();

    const list = await loadedRegion('Vietsub list');
    expect(within(list).queryByRole('button')).not.toBeInTheDocument();
    expect(within(list).queryByLabelText(/Replace Vietsub/)).not.toBeInTheDocument();
  });

  it('points to the Vietsub page when nothing has Vietsub yet', async () => {
    fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [none] }]);
    renderPage();

    expect(await screen.findByText(/No videos with Vietsub yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add Vietsub' })).toHaveAttribute('href', '/vietsub');
  });

  describe('pagination', () => {
    it('shows 10 videos per page with a pager', async () => {
      fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: many(23) }]);
      renderPage();

      const list = await loadedRegion('Vietsub list');
      expect(titles(list)).toEqual(many(10).map((v) => v.title));
      const pager = within(list).getByRole('navigation', { name: 'Pagination' });
      expect(within(pager).getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
      expect(within(pager).getByRole('button', { name: 'Page 3' })).toBeInTheDocument();
    });

    it('has no pager for 10 videos or fewer', async () => {
      fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: many(10) }]);
      renderPage();

      const list = await loadedRegion('Vietsub list');
      expect(within(list).getAllByRole('listitem')).toHaveLength(10);
      expect(within(list).queryByRole('navigation')).not.toBeInTheDocument();
    });

    it('moves to another page and keeps it in the URL', async () => {
      fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: many(23) }]);
      renderPage();
      const list = await loadedRegion('Vietsub list');
      const user = userEvent.setup();

      await user.click(within(list).getByRole('button', { name: 'Page 2' }));
      expect(titles(list)[0]).toBe('Video 11');
      expect(screen.getByLabelText('search')).toHaveTextContent('?page=2');

      await user.click(within(list).getByRole('button', { name: 'Next page' }));
      expect(titles(list)).toEqual(['Video 21', 'Video 22', 'Video 23']);

      await user.click(within(list).getByRole('button', { name: 'Previous page' }));
      expect(titles(list)[0]).toBe('Video 11');
    });

    it('opens on the page given in the URL', async () => {
      fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: many(23) }]);
      renderPage('/vietsub/list?page=3');

      const list = await loadedRegion('Vietsub list');
      expect(titles(list)).toEqual(['Video 21', 'Video 22', 'Video 23']);
      expect(within(list).getByRole('button', { name: 'Page 3' })).toHaveAttribute('aria-current', 'page');
    });

    it('shows the last page when the URL points past the end', async () => {
      fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: many(12) }]);
      renderPage('/vietsub/list?page=9');

      const list = await loadedRegion('Vietsub list');
      expect(titles(list)).toEqual(['Video 11', 'Video 12']);
    });
  });

  it('explains when the list cannot be loaded', async () => {
    fakeFetch([]);
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
  });

  describe('playlists and search', () => {
    const cho = { ...vsVideo('CHO00000001', 'Khám phá Chợ Đêm'), viUpdatedAt: '2026-11-02T12:00:00Z' };
    const an = { ...vsVideo('AN000000001', 'Ăn sáng Bangkok', 'Food Lovers'), viUpdatedAt: '2026-11-02T11:00:00Z' };
    const thai = { ...vsVideo('THAI0000001', 'ตะลุยตลาดนัด'), viUpdatedAt: '2026-11-02T10:00:00Z' };
    const all = [cho, an, thai];
    const vlog = summary(1, 'VLOG', 3);
    const emptyPl = summary(2, 'Empty', 0);
    const routes = (): FakeRoute[] => [
      { method: 'GET', path: '/api/videos', status: 200, body: all },
      { method: 'GET', path: '/api/playlists', status: 200, body: [vlog, emptyPl] },
      { method: 'GET', path: '/api/playlists/1', status: 200, body: detail(1, 'VLOG', [thai, cho, an], 'Our trips') },
      { method: 'GET', path: '/api/playlists/2', status: 200, body: detail(2, 'Empty', []) },
    ];
    const rowTitles = (region: HTMLElement) =>
      within(region)
        .queryAllByRole('listitem')
        .map((li) => li.querySelector('.history__title')?.textContent);
    const search = () => screen.getByLabelText('search').textContent;

    it('shows an All chip with the count and one chip per playlist', async () => {
      fakeFetch(routes());
      renderPage();
      await loadedRegion('Vietsub list');

      const chips = await screen.findByRole('navigation', { name: 'Playlists' });
      await within(chips).findByRole('link', { name: 'VLOG (3)' });
      expect(within(chips).getByRole('link', { name: 'All (3)' })).toHaveAttribute('aria-current', 'page');
      expect(within(chips).getByRole('link', { name: 'Empty (0)' })).toBeInTheDocument();
    });

    it('filters All by title while typing and keeps q in the URL', async () => {
      fakeFetch(routes());
      renderPage();
      const region = await loadedRegion('Vietsub list');

      await userEvent.setup().type(screen.getByRole('searchbox', { name: 'Search videos' }), 'cho dem');

      expect(rowTitles(region)).toEqual(['Khám phá Chợ Đêm']);
      expect(search()).toBe('?q=cho+dem');
    });

    it('matches the channel name', async () => {
      fakeFetch(routes());
      renderPage('/vietsub/list?q=food');
      const region = await loadedRegion('Vietsub list');

      expect(rowTitles(region)).toEqual(['Ăn sáng Bangkok']);
      expect(screen.getByRole('searchbox', { name: 'Search videos' })).toHaveValue('food');
    });

    it('says when nothing matches and clears with the X button', async () => {
      fakeFetch(routes());
      renderPage('/vietsub/list?q=zzz');
      const region = await loadedRegion('Vietsub list');

      expect(within(region).getByText('No videos match "zzz".')).toBeInTheDocument();
      await userEvent.setup().click(screen.getByRole('button', { name: 'Clear search' }));
      expect(rowTitles(region)).toHaveLength(3);
      expect(search()).toBe('');
    });

    it('shows a YouTube-like header and the playlist order when a playlist is chosen', async () => {
      fakeFetch(routes());
      renderPage();
      await loadedRegion('Vietsub list');
      const chips = await screen.findByRole('navigation', { name: 'Playlists' });

      await userEvent.setup().click(await within(chips).findByRole('link', { name: 'VLOG (3)' }));

      const header = await screen.findByRole('region', { name: 'Playlist VLOG' });
      expect(within(header).getByRole('heading', { name: 'VLOG' })).toBeInTheDocument();
      expect(within(header).getByText('Our trips')).toBeInTheDocument();
      expect(within(header).getByText('3 videos')).toBeInTheDocument();
      expect(within(header).getByRole('link', { name: 'Play all' })).toHaveAttribute(
        'href',
        '/vietsub/THAI0000001?playlist=1',
      );
      const region = await loadedRegion('Vietsub list');
      await waitFor(() => expect(rowTitles(region)).toEqual(['ตะลุยตลาดนัด', 'Khám phá Chợ Đêm', 'Ăn sáng Bangkok']));
      const items = within(region).getAllByRole('listitem');
      expect(items.map((li) => li.querySelector('.vlist__index')?.textContent)).toEqual(['1', '2', '3']);
      expect(within(items[1]).getByRole('link')).toHaveAttribute('href', '/vietsub/CHO00000001?playlist=1');
      expect(within(chips).getByRole('link', { name: 'VLOG (3)' })).toHaveAttribute('aria-current', 'page');
      expect(search()).toBe('?playlist=1');
    });

    it('starts playing right away after Play all', async () => {
      fakeFetch(routes());
      renderPage('/vietsub/list?playlist=1');
      const header = await screen.findByRole('region', { name: 'Playlist VLOG' });

      await userEvent.setup().click(within(header).getByRole('link', { name: 'Play all' }));

      expect(await screen.findByText('watch /vietsub/THAI0000001?playlist=1 autoplay=true')).toBeInTheDocument();
    });

    it('keeps the original numbers when searching inside a playlist', async () => {
      fakeFetch(routes());
      renderPage('/vietsub/list?playlist=1&q=bangkok');
      const region = await loadedRegion('Vietsub list');

      await waitFor(() => expect(rowTitles(region)).toEqual(['Ăn sáng Bangkok']));
      expect(within(region).getByRole('listitem').querySelector('.vlist__index')?.textContent).toBe('3');
    });

    it('has no Play all for an empty playlist', async () => {
      fakeFetch(routes());
      renderPage('/vietsub/list?playlist=2');

      const header = await screen.findByRole('region', { name: 'Playlist Empty' });
      expect(within(header).getByText('0 videos')).toBeInTheDocument();
      expect(within(header).queryByRole('link', { name: 'Play all' })).not.toBeInTheDocument();
      expect(
        await within(await loadedRegion('Vietsub list')).findByText(/This playlist has no videos yet/),
      ).toBeInTheDocument();
    });

    it('falls back to All when the playlist in the URL does not exist', async () => {
      fakeFetch(routes());
      renderPage('/vietsub/list?playlist=999');
      const region = await loadedRegion('Vietsub list');

      await waitFor(() => expect(rowTitles(region)).toHaveLength(3));
      const chips = await screen.findByRole('navigation', { name: 'Playlists' });
      await waitFor(() =>
        expect(within(chips).getByRole('link', { name: 'All (3)' })).toHaveAttribute('aria-current', 'page'),
      );
      expect(screen.queryByRole('region', { name: /^Playlist / })).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('goes back to page 1 when the playlist or the query changes', async () => {
      fakeFetch([
        { method: 'GET', path: '/api/videos', status: 200, body: many(23) },
        { method: 'GET', path: '/api/playlists', status: 200, body: [summary(1, 'VLOG', 1)] },
        { method: 'GET', path: '/api/playlists/1', status: 200, body: detail(1, 'VLOG', [thai]) },
      ]);
      renderPage('/vietsub/list?page=2');
      await loadedRegion('Vietsub list');
      const user = userEvent.setup();

      await user.type(screen.getByRole('searchbox', { name: 'Search videos' }), 'video');
      expect(search()).toBe('?q=video');

      const chips = await screen.findByRole('navigation', { name: 'Playlists' });
      await user.click(await within(chips).findByRole('link', { name: 'VLOG (1)' }));
      expect(search()).toBe('?playlist=1');
    });

    it('links rows in All without a playlist and without numbers', async () => {
      fakeFetch(routes());
      renderPage();
      const region = await loadedRegion('Vietsub list');

      const first = within(region).getAllByRole('listitem')[0];
      expect(within(first).getByRole('link')).toHaveAttribute('href', '/vietsub/CHO00000001');
      expect(first.querySelector('.vlist__index')).toBeNull();
    });
  });
});
