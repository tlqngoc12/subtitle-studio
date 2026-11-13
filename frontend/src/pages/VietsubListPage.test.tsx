import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadedRegion } from '../test/loadedRegion';
import type { VideoDto } from '../api/client';
import { fakeFetch, type Route as FakeRoute } from '../test/fakeFetch';
import { detail, summary, vsVideo } from '../test/playlistFixtures';
import VietsubListPage from './VietsubListPage';
import { SiteProvider } from '../data/SiteContext';
import { resetWatched } from '../data/watched';
import { fakeSource, publicSite } from '../test/fakeSource';
import { css } from '../test/css';

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
    translationModel: null,
    editStatus: null,
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

function renderPage(entry = '/vietsub/list?tab=all') {
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

  it('puts the search in a toolbar under the tabs', async () => {
    fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [newer] }]);
    renderPage();
    await loadedRegion('Vietsub list');

    const tablist = screen.getByRole('tablist');
    const search = screen.getByRole('searchbox');
    expect(search.closest('.toolbar')).not.toBeNull();
    expect(tablist.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The toolbar caps the search at 360 px from 521 px (Toolbar.css); the page no longer styles it itself.
    expect(css).not.toMatch(/\.page > \.searchbar/);
  });

  it('has no replace or delete actions', async () => {
    fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [newer] }]);
    renderPage();

    const list = await loadedRegion('Vietsub list');
    expect(within(list).queryByRole('button')).not.toBeInTheDocument();
    expect(within(list).queryByLabelText(/Replace Vietsub/)).not.toBeInTheDocument();
  });

  it('has no Add Vietsub link when nothing has Vietsub yet', async () => {
    fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [none] }]);
    renderPage();

    expect(await screen.findByText(/No videos with Vietsub yet/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Add Vietsub' })).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('Add Vietsub');
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
      expect(screen.getByLabelText('search')).toHaveTextContent('?tab=all&page=2');

      await user.click(within(list).getByRole('button', { name: 'Next page' }));
      expect(titles(list)).toEqual(['Video 21', 'Video 22', 'Video 23']);

      await user.click(within(list).getByRole('button', { name: 'Previous page' }));
      expect(titles(list)[0]).toBe('Video 11');
    });

    it('opens on the page given in the URL', async () => {
      fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: many(23) }]);
      renderPage('/vietsub/list?tab=all&page=3');

      const list = await loadedRegion('Vietsub list');
      expect(titles(list)).toEqual(['Video 21', 'Video 22', 'Video 23']);
      expect(within(list).getByRole('button', { name: 'Page 3' })).toHaveAttribute('aria-current', 'page');
    });

    it('shows the last page when the URL points past the end', async () => {
      fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: many(12) }]);
      renderPage('/vietsub/list?tab=all&page=9');

      const list = await loadedRegion('Vietsub list');
      expect(titles(list)).toEqual(['Video 11', 'Video 12']);
    });
  });

  it('explains when the list cannot be loaded', async () => {
    fakeFetch([]);
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
  });

  describe('tabs, playlists and search', () => {
    const cho = { ...vsVideo('CHO00000001', 'Khám phá Chợ Đêm'), viUpdatedAt: '2026-11-02T12:00:00Z' };
    const an = { ...vsVideo('AN000000001', 'Ăn sáng Bangkok', 'Food Lovers'), viUpdatedAt: '2026-11-02T11:00:00Z' };
    const thai = { ...vsVideo('THAI0000001', 'ตะลุยตลาดนัด'), viUpdatedAt: '2026-11-02T10:00:00Z' };
    const all = [cho, an, thai];
    const vlog = summary(1, 'VLOG', 3);
    const fm = summary(3, 'Fan Meeting', 1);
    const emptyPl = summary(2, 'Empty', 0);
    const routes = (): FakeRoute[] => [
      { method: 'GET', path: '/api/videos', status: 200, body: all },
      { method: 'GET', path: '/api/playlists', status: 200, body: [vlog, fm, emptyPl] },
      { method: 'GET', path: '/api/playlists/1', status: 200, body: detail(1, 'VLOG', [thai, cho, an], 'Our trips') },
      { method: 'GET', path: '/api/playlists/3', status: 200, body: detail(3, 'Fan Meeting', [cho]) },
      { method: 'GET', path: '/api/playlists/2', status: 200, body: detail(2, 'Empty', []) },
    ];
    const rowTitles = (region: HTMLElement) =>
      within(region)
        .queryAllByRole('listitem')
        .map((li) => li.querySelector('.history__title')?.textContent);
    const search = () => screen.getByLabelText('search').textContent;
    const cardNames = async () => {
      const region = await screen.findByRole('region', { name: 'Playlists' });
      await waitFor(() => expect(within(region).queryByText('Loading playlists…')).not.toBeInTheDocument());
      return within(region)
        .queryAllByRole('region', { name: /^Playlist / })
        .map((c) => c.getAttribute('aria-label')!.replace('Playlist ', ''));
    };
    const card = (name: string) => screen.getByRole('region', { name: `Playlist ${name}` });

    it('opens on the Playlists tab with one card per playlist', async () => {
      fakeFetch(routes());
      renderPage('/vietsub/list');

      expect(await screen.findByRole('tab', { name: 'Playlists' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tab', { name: 'All videos' })).toHaveAttribute('aria-selected', 'false');
      expect(await cardNames()).toEqual(['VLOG', 'Fan Meeting', 'Empty']);
      expect(within(card('VLOG')).getByText('3 videos')).toBeInTheDocument();
      expect(within(card('VLOG')).getByRole('link', { name: 'VLOG' })).toHaveAttribute('href', '/vietsub/list?playlist=1');
      expect(within(card('VLOG')).getByRole('link', { name: 'Play all' })).toHaveAttribute(
        'href',
        '/vietsub/THAI0000001?playlist=1',
      );
    });

    it('previews the first videos on a card without a description', async () => {
      fakeFetch(routes());
      renderPage('/vietsub/list');
      await cardNames();

      expect(within(card('VLOG')).getByText('Our trips')).toBeInTheDocument();
      expect(within(card('VLOG')).queryByRole('list')).not.toBeInTheDocument();
      const preview = within(card('Fan Meeting')).getByRole('list', { name: 'First videos' });
      expect(within(preview).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Khám phá Chợ Đêm']);
    });

    it('switches to All videos and keeps the query, back on page 1', async () => {
      fakeFetch(routes());
      renderPage('/vietsub/list?q=bangkok&page=2');
      const user = userEvent.setup();
      await cardNames();

      await user.click(screen.getByRole('tab', { name: 'All videos' }));

      const region = await loadedRegion('Vietsub list');
      expect(rowTitles(region)).toEqual(['Ăn sáng Bangkok']);
      expect(search()).toBe('?q=bangkok&tab=all');
      await user.click(screen.getByRole('tab', { name: 'Playlists' }));
      expect(search()).toBe('?q=bangkok');
    });

    it('switches tabs without loading again (no jumpy layout)', async () => {
      const calls = fakeFetch(routes());
      renderPage('/vietsub/list');
      await cardNames();
      await screen.findByRole('tab', { name: 'All videos' });
      const user = userEvent.setup();
      const loadsBefore = calls.length;

      await user.click(screen.getByRole('tab', { name: 'All videos' }));
      expect(screen.queryByText('Loading list…')).not.toBeInTheDocument();
      expect(rowTitles(screen.getByRole('region', { name: 'Vietsub list' }))).toHaveLength(3);

      await user.click(screen.getByRole('tab', { name: 'Playlists' }));
      expect(screen.queryByText('Loading playlists…')).not.toBeInTheDocument();
      expect(await cardNames()).toEqual(['VLOG', 'Fan Meeting', 'Empty']);

      expect(calls.length).toBe(loadsBefore);
    });

    it('filters All videos by title while typing and keeps q in the URL', async () => {
      fakeFetch(routes());
      renderPage();
      const region = await loadedRegion('Vietsub list');

      await userEvent.setup().type(screen.getByRole('searchbox', { name: 'Search videos' }), 'cho dem');

      expect(rowTitles(region)).toEqual(['Khám phá Chợ Đêm']);
      expect(search()).toBe('?tab=all&q=cho+dem');
    });

    it('matches the channel name', async () => {
      fakeFetch(routes());
      renderPage('/vietsub/list?tab=all&q=food');
      const region = await loadedRegion('Vietsub list');

      expect(rowTitles(region)).toEqual(['Ăn sáng Bangkok']);
      expect(screen.getByRole('searchbox', { name: 'Search videos' })).toHaveValue('food');
    });

    it('says when no video matches and clears with the X button', async () => {
      fakeFetch(routes());
      renderPage('/vietsub/list?tab=all&q=zzz');
      const region = await loadedRegion('Vietsub list');

      expect(within(region).getByText('No videos match "zzz".')).toBeInTheDocument();
      await userEvent.setup().click(screen.getByRole('button', { name: 'Clear search' }));
      expect(rowTitles(region)).toHaveLength(3);
      expect(search()).toBe('?tab=all');
    });

    it('finds playlists by name and keeps their total count', async () => {
      fakeFetch(routes());
      renderPage('/vietsub/list?q=vlog');

      expect(await cardNames()).toEqual(['VLOG']);
      expect(within(card('VLOG')).getByText('3 videos')).toBeInTheDocument();
      expect(screen.getByRole('searchbox', { name: 'Search playlists and videos' })).toHaveValue('vlog');
    });

    it('finds playlists by their videos and counts only the matches', async () => {
      fakeFetch(routes());
      renderPage('/vietsub/list?q=cho+dem');

      expect(await cardNames()).toEqual(['VLOG', 'Fan Meeting']);
      expect(within(card('VLOG')).getByText('1 video')).toBeInTheDocument();
      expect(within(card('Fan Meeting')).getByText('1 video')).toBeInTheDocument();
    });

    it('says when no playlist matches', async () => {
      fakeFetch(routes());
      renderPage('/vietsub/list?q=zzz');

      expect(await screen.findByText('No playlists match "zzz".')).toBeInTheDocument();
    });

    it('pages through playlist cards, 10 per page', async () => {
      const twelve = Array.from({ length: 12 }, (_, i) => summary(i + 10, `PL ${String(i + 1).padStart(2, '0')}`, 1));
      fakeFetch([
        { method: 'GET', path: '/api/videos', status: 200, body: all },
        { method: 'GET', path: '/api/playlists', status: 200, body: twelve },
        ...twelve.map(
          (p): FakeRoute => ({ method: 'GET', path: `/api/playlists/${p.id}`, status: 200, body: detail(p.id, p.name, [cho]) }),
        ),
      ]);
      renderPage('/vietsub/list');

      expect(await cardNames()).toHaveLength(10);
      await userEvent.setup().click(screen.getByRole('button', { name: 'Page 2' }));
      expect(await cardNames()).toEqual(['PL 11', 'PL 12']);
      expect(search()).toBe('?page=2');
    });

    it('opens a playlist with its videos in order and a link back to Playlists', async () => {
      fakeFetch(routes());
      renderPage('/vietsub/list');
      await cardNames();

      await userEvent.setup().click(within(card('VLOG')).getByRole('link', { name: 'VLOG' }));

      const header = await screen.findByRole('region', { name: 'Playlist VLOG' });
      expect(within(header).getByText('Our trips')).toBeInTheDocument();
      expect(within(header).getByText('3 videos')).toBeInTheDocument();
      const region = await loadedRegion('Vietsub list');
      await waitFor(() => expect(rowTitles(region)).toEqual(['ตะลุยตลาดนัด', 'Khám phá Chợ Đêm', 'Ăn sáng Bangkok']));
      const items = within(region).getAllByRole('listitem');
      expect(items.map((li) => li.querySelector('.vlist__index')?.textContent)).toEqual(['1', '2', '3']);
      expect(within(items[1]).getByRole('link')).toHaveAttribute('href', '/vietsub/CHO00000001?playlist=1');
      const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
      expect(within(crumbs).getByRole('link', { name: 'Vietsub list' })).toHaveAttribute('href', '/vietsub/list');
      expect(within(crumbs).getByText('VLOG')).toHaveAttribute('aria-current', 'page');
      expect(document.querySelector('.back-link')).toBeNull();
      expect(screen.queryByRole('tab')).not.toBeInTheDocument();
      expect(search()).toBe('?playlist=1');
    });

    it('starts playing right away after Play all', async () => {
      fakeFetch(routes());
      renderPage('/vietsub/list?playlist=1');
      const header = await screen.findByRole('region', { name: 'Playlist VLOG' });

      await userEvent.setup().click(within(header).getByRole('link', { name: 'Play all' }));

      expect(await screen.findByText('watch /vietsub/THAI0000001?playlist=1 autoplay=true')).toBeInTheDocument();
    });

    describe('watched and Continue', () => {
      const markSeen = (...ids: string[]) => {
        localStorage.setItem('subtitle-studio.watched', JSON.stringify(ids));
        resetWatched();
      };
      beforeEach(() => {
        localStorage.clear();
        resetWatched();
      });

      it('marks watched videos in a playlist, and only those', async () => {
        markSeen('CHO00000001');
        fakeFetch(routes());
        renderPage('/vietsub/list?playlist=1');
        const region = await loadedRegion('Vietsub list');

        const items = await waitFor(() => {
          const li = within(region).getAllByRole('listitem');
          expect(li).toHaveLength(3);
          return li;
        });
        expect(within(items[0]).queryByText('Watched')).not.toBeInTheDocument();
        expect(within(items[1]).getByText('Watched')).toBeInTheDocument();
      });

      it('marks watched videos in All videos too', async () => {
        markSeen('AN000000001');
        fakeFetch(routes());
        renderPage('/vietsub/list?tab=all');
        const region = await loadedRegion('Vietsub list');

        expect(within(region).getAllByText('Watched')).toHaveLength(1);
      });

      it('offers Continue with the first unwatched episode once something was watched', async () => {
        markSeen('THAI0000001');
        fakeFetch(routes());
        renderPage('/vietsub/list?playlist=1');
        const header = await screen.findByRole('region', { name: 'Playlist VLOG' });

        const link = within(header).getByRole('link', { name: 'Continue' });
        expect(link).toHaveAttribute('href', '/vietsub/CHO00000001?playlist=1');
        await userEvent.setup().click(link);
        expect(await screen.findByText('watch /vietsub/CHO00000001?playlist=1 autoplay=true')).toBeInTheDocument();
      });

      it('names the next video instead of an episode number', async () => {
        markSeen('THAI0000001');
        fakeFetch(routes());
        renderPage('/vietsub/list?playlist=1');
        const header = await screen.findByRole('region', { name: 'Playlist VLOG' });

        expect(within(header).getByText('Up next: Khám phá Chợ Đêm')).toBeInTheDocument();
        expect(within(header).queryByText(/EP \d/)).not.toBeInTheDocument();
      });

      it('skips watched episodes in the middle', async () => {
        markSeen('THAI0000001', 'AN000000001');
        fakeFetch(routes());
        renderPage('/vietsub/list?playlist=1');
        const header = await screen.findByRole('region', { name: 'Playlist VLOG' });

        expect(within(header).getByRole('link', { name: 'Continue' })).toBeInTheDocument();
      });

      it('has no Continue before anything was watched, or after everything was', async () => {
        fakeFetch(routes());
        renderPage('/vietsub/list?playlist=1');
        const header = await screen.findByRole('region', { name: 'Playlist VLOG' });
        expect(within(header).queryByRole('link', { name: /^Continue/ })).not.toBeInTheDocument();
        cleanup();

        markSeen('THAI0000001', 'CHO00000001', 'AN000000001');
        fakeFetch(routes());
        renderPage('/vietsub/list?playlist=1');
        const again = await screen.findByRole('region', { name: 'Playlist VLOG' });
        expect(within(again).queryByRole('link', { name: /^Continue/ })).not.toBeInTheDocument();
      });

      it('shows Continue on the playlist card too', async () => {
        markSeen('THAI0000001');
        fakeFetch(routes());
        renderPage('/vietsub/list');
        await cardNames();

        expect(within(card('VLOG')).getByRole('link', { name: 'Continue' })).toHaveAttribute(
          'href',
          '/vietsub/CHO00000001?playlist=1',
        );
      });
    });

    it('keeps the original numbers when searching inside a playlist', async () => {
      fakeFetch(routes());
      renderPage('/vietsub/list?playlist=1&q=bangkok');
      const region = await loadedRegion('Vietsub list');

      await waitFor(() => expect(rowTitles(region)).toEqual(['Ăn sáng Bangkok']));
      expect(within(region).getByRole('listitem').querySelector('.vlist__index')?.textContent).toBe('3');
      expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Vietsub list' })).toHaveAttribute('href', '/vietsub/list?q=bangkok');
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

    it('falls back to the Playlists tab when the playlist in the URL does not exist', async () => {
      fakeFetch(routes());
      renderPage('/vietsub/list?playlist=999');

      expect(await screen.findByRole('tab', { name: 'Playlists' })).toHaveAttribute('aria-selected', 'true');
      expect(await cardNames()).toEqual(['VLOG', 'Fan Meeting', 'Empty']);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('links rows in All videos without a playlist and without numbers', async () => {
      fakeFetch(routes());
      renderPage();
      const region = await loadedRegion('Vietsub list');

      const first = within(region).getAllByRole('listitem')[0];
      expect(within(first).getByRole('link')).toHaveAttribute('href', '/vietsub/CHO00000001');
      expect(first.querySelector('.vlist__index')).toBeNull();
    });
  });
});

describe('VietsubListPage titles', () => {
  it('a long video title wraps and clamps instead of overflowing', async () => {
    const long = video('LONG0000001', 'Tiêu đề rất dài '.repeat(20), 5, '2026-11-02T10:00:00Z');
    fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [long] }]);
    renderPage();

    const list = await loadedRegion('Vietsub list');
    expect(within(list).getByText(/^Tiêu đề rất dài/)).toHaveClass('title-clamp');
  });
});

describe('VietsubListPage on the public site', () => {
  function renderPublic(source: Parameters<typeof publicSite>[0]) {
    return render(
      <SiteProvider value={publicSite(source)}>
        <MemoryRouter initialEntries={['/vietsub/list?tab=all']}>
          <Routes>
            <Route path="/vietsub/list" element={<VietsubListPage />} />
          </Routes>
        </MemoryRouter>
      </SiteProvider>,
    );
  }

  it('usesTheSiteSource', async () => {
    renderPublic(fakeSource({ listVideos: async () => [newer, older] }));

    const list = await loadedRegion('Danh sách Vietsub');
    expect(within(list).getByText('Học Spring Boot')).toBeInTheDocument();
    expect(within(list).getByText('Video cũ hơn')).toBeInTheDocument();
  });

  it('readOnlyEmptyStateHasNoAddLink', async () => {
    renderPublic(fakeSource({ listVideos: async () => [] }));

    expect(await screen.findByText(/Chưa có video nào có Vietsub\./)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Add Vietsub' })).not.toBeInTheDocument();
  });
});
