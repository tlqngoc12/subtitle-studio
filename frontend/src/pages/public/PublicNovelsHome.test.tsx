import { SiteProvider } from '../../data/SiteContext';
import { fakeSource, publicSite } from '../../test/fakeSource';
import { fanfic } from '../../test/fanficFixtures';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { NovelSource } from '../../data/novelSource';
import type { PublicNovelSummary } from '../../data/novelTypes';
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
    createdAt: `2026-0${n}-01T10:00:00Z`,
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

const cardsOf = () => within(screen.getByRole('list', { name: 'Danh sách truyện' })).getAllByRole('listitem');

beforeEach(() => localStorage.clear());
afterEach(() => {
  document.title = '';
});

describe('PublicNovelsPage (home)', () => {
  it('features the newest novels first, at most five, when none is picked', async () => {
    renderHome();

    const banner = await screen.findByRole('region', { name: 'Truyện nổi bật' });
    expect(within(banner).getByRole('heading', { name: 'Truyện 8' })).toBeInTheDocument();
    expect(within(banner).getByText('01 / 05')).toBeInTheDocument();
    // The covers are in newest-first order: 8, 7, 6, 5, 4.
    expect(
      within(banner).getAllByRole('link', { name: /^Truyện \d$/ }).map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Truyện 8', 'Truyện 7', 'Truyện 6', 'Truyện 5', 'Truyện 4']);
  });

  it('banners only the picked novels', async () => {
    renderHome(EIGHT.map((n) => (n.slug === 'n2' || n.slug === 'n5' ? { ...n, featured: true } : n)));

    const banner = await screen.findByRole('region', { name: 'Truyện nổi bật' });
    expect(
      within(banner).getAllByRole('link', { name: /^Truyện \d$/ }).map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Truyện 5', 'Truyện 2']);
  });

  it('lists every novel as a card, newest update first, with no Mới cập nhật section', async () => {
    renderHome();

    await screen.findByRole('list', { name: 'Danh sách truyện' });
    const cards = cardsOf();
    expect(cards).toHaveLength(8);
    expect(cards.map((li) => within(li).getByRole('link').getAttribute('href'))).toEqual([
      '/novels/n8', '/novels/n7', '/novels/n6', '/novels/n5', '/novels/n4', '/novels/n3', '/novels/n2', '/novels/n1',
    ]);
    expect(within(cards[0]).getByText('Chương').closest('.fanfic-stat')?.querySelector('.fanfic-stat__value')).toHaveTextContent(/^1 chương$/);
    expect(within(cards[0]).getByText('Đang ra')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Mới cập nhật' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Xem tất cả' })).not.toBeInTheDocument();
  });

  it('searches, filters by status and sorts', async () => {
    renderHome(
      EIGHT.map((n) => (n.slug === 'n3' ? { ...n, novelStatus: 'COMPLETED' as const, originalAuthor: 'Minh Anh' } : n)),
    );
    await screen.findByRole('list', { name: 'Danh sách truyện' });
    const user = userEvent.setup();
    const search = () => screen.getByRole('searchbox', { name: 'Tìm truyện' });

    await user.type(search(), 'minh anh');
    expect(cardsOf()).toHaveLength(1);
    await user.clear(search());

    await user.click(screen.getByRole('button', { name: 'Hoàn thành' }));
    expect(cardsOf()).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Tất cả' }));
    expect(cardsOf()).toHaveLength(8);

    await user.click(screen.getByRole('combobox', { name: 'Sắp xếp theo' }));
    await user.click(await screen.findByRole('option', { name: 'Tên A–Z' }));
    expect(within(cardsOf()[0]).getByRole('link').getAttribute('href')).toBe('/novels/n1');

    await user.click(screen.getByRole('combobox', { name: 'Sắp xếp theo' }));
    await user.click(await screen.findByRole('option', { name: 'Mới thêm' }));
    expect(within(cardsOf()[0]).getByRole('link').getAttribute('href')).toBe('/novels/n8');

    await user.type(search(), 'khong co');
    expect(screen.getByText('Không tìm thấy truyện nào.')).toBeInTheDocument();
  });

  it('heads the full list Tất cả truyện, above the search, after Tủ sách', async () => {
    localStorage.setItem('novel-shelf', JSON.stringify(['n2']));
    renderHome();

    const all = await screen.findByRole('region', { name: 'Tất cả truyện' });
    const heading = within(all).getByRole('heading', { level: 2, name: 'Tất cả truyện' });
    const search = within(all).getByRole('searchbox', { name: 'Tìm truyện' });
    expect(heading.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const shelf = screen.getByRole('region', { name: 'Tủ sách' });
    expect(shelf.compareDocumentPosition(all) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows Tủ sách only with shelved novels', async () => {
    const { unmount } = renderHome();
    await screen.findByRole('list', { name: 'Danh sách truyện' });
    expect(screen.queryByRole('region', { name: 'Tủ sách' })).not.toBeInTheDocument();
    unmount();

    localStorage.setItem('novel-shelf', JSON.stringify(['n2', 'gone', 'n5']));
    localStorage.setItem('novel-progress:n2', JSON.stringify({ chapterNo: 1 }));
    renderHome();
    const shelf = await screen.findByRole('region', { name: 'Tủ sách' });
    expect(within(shelf).getAllByRole('listitem')).toHaveLength(2);
    expect(within(shelf).getByText('Đang đọc Chương 1')).toBeInTheDocument();
    expect(within(shelf).getByRole('link', { name: 'Xem tất cả (2)' })).toHaveAttribute('href', '/novels/shelf');
  });

  it('still shows a novel with a single published chapter', async () => {
    renderHome([novel(1)]);

    await screen.findByRole('list', { name: 'Danh sách truyện' });
    expect(cardsOf()).toHaveLength(1);
    const banner = screen.getByRole('region', { name: 'Truyện nổi bật' });
    expect(within(banner).getByRole('heading', { name: /Truyện/ })).toBeInTheDocument();
    // A lone novel has nothing to browse: no counter, arrows or pause button (FanCarousel).
    expect(within(banner).queryByText('01 / 01')).not.toBeInTheDocument();
  });

  it('copes with a novels.json from an older publish (no featured, createdAt, description, lastPublishedAt)', async () => {
    const legacy = (n: number) => ({
      slug: `n${n}`,
      title: `Truyện ${n}`,
      coverUrl: null,
      originalAuthor: null,
      tags: [],
      novelStatus: 'ONGOING',
      publishedCount: 1,
      updatedAt: `2026-10-0${n}T10:00:00Z`,
    });
    renderHome([legacy(1), legacy(3), legacy(2)] as unknown as PublicNovelSummary[]);

    await screen.findByRole('list', { name: 'Danh sách truyện' });
    expect(cardsOf().map((li) => within(li).getByRole('link').getAttribute('href'))).toEqual([
      '/novels/n3', '/novels/n2', '/novels/n1',
    ]);
    const chapterValues = Array.from(document.querySelectorAll('.fanfic-stat'))
      .filter((s) => s.querySelector('.fanfic-stat__name')?.textContent === 'Chương')
      .map((s) => s.querySelector('.fanfic-stat__value')?.textContent);
    expect(chapterValues).toEqual(['1 chương', '1 chương', '1 chương']); // published count only
    expect(screen.getByRole('region', { name: 'Truyện nổi bật' })).toBeInTheDocument(); // fallback banner

    // Every sort still works without createdAt.
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Sắp xếp theo' }));
    await user.click(await screen.findByRole('option', { name: 'Mới thêm' }));
    expect(cardsOf()).toHaveLength(3);
  });

  it('keeps a full fallback banner when the picked novels are not in the public list', async () => {
    // Picked novels without a published chapter are not exported, so nothing in the list is `featured`.
    renderHome(EIGHT.map((n) => ({ ...n, featured: false })));

    const banner = await screen.findByRole('region', { name: 'Truyện nổi bật' });
    expect(within(banner).getAllByRole('link', { name: /^Truyện \d$/ })).toHaveLength(5);
  });

  it('keeps the empty state and the Truyện heading and tab title', async () => {
    renderHome([]);

    const h1 = screen.getByRole('heading', { level: 1, name: 'Truyện' });
    expect(h1).toBeVisible();
    expect(h1).not.toHaveClass('visually-hidden');
    // The header sits above the tabs.
    expect(h1.compareDocumentPosition(screen.getByRole('tablist')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

    expect(screen.getByRole('tab', { name: 'Truyện dịch' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('list', { name: 'Danh sách truyện' })).toBeInTheDocument();
  });

  it('shows the read-only Fanfics tab from ?tab=fanfics', async () => {
    renderAt('/novels?tab=fanfics');

    expect(screen.getByRole('tab', { name: 'Fanfic' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('link', { name: /Warm Story/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add fanfic' })).not.toBeInTheDocument();
  });
});
