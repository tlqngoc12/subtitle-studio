import { SiteProvider } from '../../data/SiteContext';
import { fakeSource, publicSite } from '../../test/fakeSource';
import { fanfic } from '../../test/fanficFixtures';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { NovelSource } from '../../data/novelSource';
import type { PublicNovelSummary } from '../../data/novelTypes';
import PublicAllNovelsPage from './PublicAllNovelsPage';
import PublicNovelsPage from './PublicNovelsPage';

/** Novel `n` (1..) was last published `n` days after 1 October, so a larger n is newer. */
function novel(n: number, over: Partial<PublicNovelSummary> = {}): PublicNovelSummary {
  const day = String(n).padStart(2, '0');
  return {
    slug: `n${n}`,
    title: `Truyện ${n}`,
    coverUrl: null,
    originalAuthor: null,
    tags: [],
    novelStatus: 'ONGOING',
    publishedCount: 1,
    totalChapters: n,
    lastPublishedAt: `2026-10-${day}T10:00:00Z`,
    updatedAt: '2026-09-01T10:00:00Z',
    ...over,
  };
}

// Listed in a scrambled order on purpose: the page sorts by the latest published chapter.
const EIGHT = [3, 8, 1, 6, 4, 7, 2, 5].map((n) => novel(n));

function sourceOf(list: PublicNovelSummary[]): NovelSource {
  return {
    listNovels: async () => list,
    getNovel: async (slug) => ({
      slug,
      title: slug,
      coverUrl: null,
      originalAuthor: null,
      description: null,
      tags: [],
      novelStatus: 'ONGOING',
      translatorCredit: null,
      sourceUrl: null,
      chapters: [{ chapterNo: 1, title: null }],
    }),
    getChapter: async () => {
      throw new Error('not used');
    },
  };
}

function renderHome(list = EIGHT) {
  return render(
    <MemoryRouter>
      <PublicNovelsPage source={sourceOf(list)} />
    </MemoryRouter>,
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  document.title = '';
});

describe('PublicNovelsPage (home)', () => {
  it('features the newest novels first, at most five', async () => {
    renderHome();

    const banner = await screen.findByRole('region', { name: 'Truyện nổi bật' });
    expect(within(banner).getByRole('heading', { name: 'Truyện 8' })).toBeInTheDocument();
    expect(within(banner).getByText('01 / 05')).toBeInTheDocument();
    // The covers are in newest-first order: 8, 7, 6, 5, 4.
    expect(
      within(banner).getAllByRole('link', { name: /^Truyện \d$/ }).map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Truyện 8', 'Truyện 7', 'Truyện 6', 'Truyện 5', 'Truyện 4']);
  });

  it('lists the 6 latest under Mới cập nhật with x/y chương and a link to all', async () => {
    renderHome();

    const section = await screen.findByRole('region', { name: 'Mới cập nhật' });
    expect(within(section).getByRole('heading', { name: 'Mới cập nhật' })).toBeInTheDocument();
    const cards = within(section).getAllByRole('listitem');
    expect(cards).toHaveLength(6);
    expect(cards.map((li) => within(li).getByRole('link').getAttribute('href'))).toEqual([
      '/novels/n8', '/novels/n7', '/novels/n6', '/novels/n5', '/novels/n4', '/novels/n3',
    ]);
    expect(within(cards[0]).getByText(/^1\/8 chương · /)).toBeInTheDocument();
    expect(within(cards[0]).getByText('Đang ra')).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'Xem tất cả' })).toHaveAttribute('href', '/novels/all');
  });

  it('shows Tủ sách only with shelved novels', async () => {
    const { unmount } = renderHome();
    await screen.findByRole('region', { name: 'Mới cập nhật' });
    expect(screen.queryByRole('region', { name: 'Tủ sách' })).not.toBeInTheDocument();
    unmount();

    localStorage.setItem('novel-shelf', JSON.stringify(['n2', 'gone', 'n5']));
    localStorage.setItem('novel-progress:n2', JSON.stringify({ chapterNo: 1 }));
    renderHome();
    const shelf = await screen.findByRole('region', { name: 'Tủ sách' });
    const rows = within(shelf).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Truyện 2')).toBeInTheDocument();
    expect(within(rows[0]).getByRole('link', { name: /Đọc tiếp: Chương 1/ })).toHaveAttribute('href', '/novels/n2/1');
    expect(within(rows[1]).queryByText(/Đọc tiếp/)).not.toBeInTheDocument();
  });

  it('Mới cập nhật renders rows with relative time', async () => {
    const recent = novel(1, { lastPublishedAt: new Date(Date.now() - 3 * 3600e3).toISOString() });
    renderHome([recent]);
    const section = await screen.findByRole('region', { name: 'Mới cập nhật' });
    expect(within(section).getByText(/chương · 3 giờ trước/)).toBeInTheDocument();
  });

  it('still shows a novel with a single published chapter', async () => {
    renderHome([novel(1)]);

    const section = await screen.findByRole('region', { name: 'Mới cập nhật' });
    expect(within(section).getAllByRole('listitem')).toHaveLength(1);
    const banner = screen.getByRole('region', { name: 'Truyện nổi bật' });
    expect(within(banner).getByRole('heading', { name: /Truyện/ })).toBeInTheDocument();
    // A lone novel has nothing to browse: no counter, arrows or pause button (FanCarousel).
    expect(within(banner).queryByText('01 / 01')).not.toBeInTheDocument();
  });

  it('orders by updatedAt for files published before lastPublishedAt existed', async () => {
    const legacy = (n: number) => ({ ...novel(n), lastPublishedAt: undefined, totalChapters: undefined, updatedAt: `2026-10-0${n}T10:00:00Z` });
    renderHome([legacy(1), legacy(3), legacy(2)] as unknown as PublicNovelSummary[]);

    const section = await screen.findByRole('region', { name: 'Mới cập nhật' });
    expect(within(section).getAllByRole('listitem').map((li) => within(li).getByRole('link').getAttribute('href'))).toEqual([
      '/novels/n3', '/novels/n2', '/novels/n1',
    ]);
    expect(within(section).getAllByText(/^1\/1 chương · /)).toHaveLength(3); // y falls back to the published count
  });

  it('keeps the empty state and the Truyện heading and tab title', async () => {
    renderHome([]);

    expect(screen.getByRole('heading', { level: 1, name: 'Truyện' })).toBeInTheDocument();
    expect(await screen.findByText('Chưa có truyện nào. Quay lại sau nhé.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Truyện nổi bật' })).not.toBeInTheDocument();
    expect(document.title).toBe('Truyện');
  });

  it('shows the Vietnamese notice when the list cannot be loaded', async () => {
    render(
      <MemoryRouter>
        <PublicNovelsPage source={{ ...sourceOf([]), listNovels: () => Promise.reject(new Error('x')) }} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Không tải được. Vui lòng thử lại sau.');
  });
});

describe('PublicAllNovelsPage (/novels/all)', () => {
  function renderAll(list = EIGHT) {
    return render(
      <MemoryRouter initialEntries={['/novels/all']}>
        <Routes>
          <Route path="/novels/all" element={<PublicAllNovelsPage source={sourceOf(list)} />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('lists every novel with the same small cards, newest first', async () => {
    document.title = 'before';
    const { unmount } = renderAll();

    expect(screen.getByRole('heading', { level: 1, name: 'Tất cả truyện' })).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Tất cả truyện' });
    const cards = within(list).getAllByRole('listitem');
    expect(cards).toHaveLength(8);
    expect(within(cards[0]).getByRole('link')).toHaveAttribute('href', '/novels/n8');
    expect(within(cards[7]).getByRole('link')).toHaveAttribute('href', '/novels/n1');
    expect(within(cards[7]).getByText('1/1 chương')).toBeInTheDocument();
    expect(document.title).toBe('Tất cả truyện');
    unmount();
    expect(document.title).toBe('before');
  });

  it('has the breadcrumb Novels > Tất cả truyện', async () => {
    renderAll();

    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Novels' })).toHaveAttribute('href', '/novels');
    expect(within(crumbs).getByText('Tất cả truyện')).toHaveAttribute('aria-current', 'page');
    await screen.findByRole('list', { name: 'Tất cả truyện' });
  });

  it('says so when there are no novels, and when the list cannot be loaded', async () => {
    const empty = renderAll([]);
    expect(await screen.findByText('Chưa có truyện nào. Quay lại sau nhé.')).toBeInTheDocument();
    empty.unmount();

    render(
      <MemoryRouter>
        <PublicAllNovelsPage source={{ ...sourceOf([]), listNovels: () => Promise.reject(new Error('x')) }} />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Không tải được. Vui lòng thử lại sau.');
  });
});

describe('PublicNovelsPage tabs', () => {
  function renderAt(path: string) {
    const site = publicSite(fakeSource({ listFanfics: async () => [fanfic({ title: 'Warm Story' })] }));
    return render(
      <SiteProvider value={site}>
        <MemoryRouter initialEntries={[path]}>
          <PublicNovelsPage source={sourceOf(EIGHT)} />
        </MemoryRouter>
      </SiteProvider>,
    );
  }

  it('defaults to Translated', async () => {
    renderAt('/novels');

    expect(screen.getByRole('tab', { name: 'Translated' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('region', { name: 'Mới cập nhật' })).toBeInTheDocument();
  });

  it('shows the read-only Fanfics tab from ?tab=fanfics', async () => {
    renderAt('/novels?tab=fanfics');

    expect(screen.getByRole('tab', { name: 'Fanfics' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('link', { name: /Warm Story/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add fanfic' })).not.toBeInTheDocument();
  });
});
