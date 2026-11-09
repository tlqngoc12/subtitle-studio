import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NovelSource } from '../../data/novelSource';
import type { PublicNovelDetail, PublicNovelSummary } from '../../data/novelTypes';
import PublicNovelPage from './PublicNovelPage';
import PublicNovelsPage from './PublicNovelsPage';

const SUMMARY: PublicNovelSummary = {
  slug: 'summer',
  title: 'Tình Yêu Mùa Hạ',
  coverUrl: '/media/c.png',
  originalAuthor: 'ผู้เขียน',
  tags: ['romance', 'BL'],
  novelStatus: 'ONGOING',
  publishedCount: 2,
  totalChapters: 5,
  lastPublishedAt: '2026-11-05T10:00:00Z',
  updatedAt: '2026-11-05T10:00:00Z',
};

const DETAIL: PublicNovelDetail = {
  slug: 'summer',
  title: 'Tình Yêu Mùa Hạ',
  coverUrl: '/media/c.png',
  originalAuthor: 'ผู้เขียน',
  description: 'Một mùa hè đáng nhớ.',
  tags: ['romance', 'BL'],
  novelStatus: 'COMPLETED',
  translatorCredit: 'Dịch: @byZenQN',
  sourceUrl: 'https://example.com/book',
  chapters: [
    { chapterNo: 1, title: 'Mở đầu' },
    { chapterNo: 3, title: null, label: 'Ngoại truyện 1' },
  ],
};

function source(over: Partial<NovelSource> = {}): NovelSource {
  return {
    listNovels: async () => [SUMMARY],
    getNovel: async () => DETAIL,
    getChapter: async () => {
      throw new Error('not used');
    },
    ...over,
  };
}

describe('PublicNovelsPage', () => {
  it('has Vietnamese headings, an empty state and a tab title', async () => {
    document.title = 'before';
    const { unmount } = render(
      <MemoryRouter>
        <PublicNovelsPage source={source({ listNovels: async () => [] })} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Truyện' })).toBeInTheDocument();
    expect(screen.getByText('Đang tải…')).toBeInTheDocument();
    expect(await screen.findByText('Chưa có truyện nào. Quay lại sau nhé.')).toBeInTheDocument();
    expect(document.title).toBe('Truyện');
    unmount();
    expect(document.title).toBe('before');
  });

  it('shows the status in Vietnamese', async () => {
    render(
      <MemoryRouter>
        <PublicNovelsPage source={source()} />
      </MemoryRouter>,
    );

    expect((await screen.findAllByText('Đang ra')).length).toBeGreaterThan(0);
  });

  it('shows a small card per novel with x/y chương', async () => {
    render(
      <MemoryRouter>
        <PublicNovelsPage source={source()} />
      </MemoryRouter>,
    );

    const section = await screen.findByRole('region', { name: 'Mới cập nhật' });
    const card = within(section).getByRole('link', { name: /Tình Yêu Mùa Hạ/ });
    expect(card).toHaveAttribute('href', '/novels/summer');
    expect(within(card).getByText('2/5 chương')).toBeInTheDocument();
  });
});

describe('PublicNovelPage', () => {
  function renderPage(s = source()) {
    render(
      <MemoryRouter initialEntries={['/novels/summer']}>
        <Routes>
          <Route path="/novels/:slug" element={<PublicNovelPage source={s} />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('shows the novel details and its published chapters', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' })).toBeInTheDocument();
    expect(screen.getByText('ผู้เขียน')).toBeInTheDocument();
    expect(screen.getByText('Hoàn thành')).toBeInTheDocument();
    expect(screen.getByText('BL')).toBeInTheDocument();
    expect(screen.getByText('Dịch: @byZenQN')).toBeInTheDocument();
    expect(screen.getByText('Một mùa hè đáng nhớ.')).toBeInTheDocument();
    const original = screen.getByRole('link', { name: 'Truyện gốc' });
    expect(original).toHaveAttribute('href', 'https://example.com/book');
    expect(original).toHaveAttribute('rel', 'noopener noreferrer');
    const chapters = within(screen.getByRole('list', { name: 'Danh sách chương' })).getAllByRole('link');
    expect(chapters.map((a) => a.textContent)).toEqual(['Chương 1: Mở đầu', 'Ngoại truyện 1']);
    expect(chapters[1]).toHaveAttribute('href', '/novels/summer/3');
    expect(screen.getByRole('link', { name: 'Bắt đầu đọc' })).toHaveAttribute('href', '/novels/summer/1');
  });

  it('uses Vietnamese labels and the novel title as the tab title', async () => {
    renderPage();

    await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });
    expect(screen.getByText('Tác giả')).toBeInTheDocument();
    expect(screen.getByText('Trạng thái')).toBeInTheDocument();
    expect(screen.getByText('Bản dịch')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Thể loại' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Danh sách chương' })).toBeInTheDocument();
    expect(document.title).toBe('Tình Yêu Mùa Hạ');
  });

  it('shows Novels > novel title as a breadcrumb', async () => {
    renderPage();

    await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Novels' })).toHaveAttribute('href', '/novels');
    const last = within(crumbs).getByText('Tình Yêu Mùa Hạ');
    expect(last).toHaveAttribute('aria-current', 'page');
    expect(last.closest('a')).toBeNull();
  });

  it('says it is loading', () => {
    renderPage(source({ getNovel: () => new Promise(() => {}) }));

    expect(screen.getByText('Đang tải truyện…')).toBeInTheDocument();
  });

  it('says when the novel does not exist', async () => {
    const { ApiError } = await import('../../api/client');
    renderPage(
      source({
        getNovel: async () => {
          throw new ApiError(404, 'NOVEL_NOT_FOUND', 'x');
        },
      }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Không tải được. Vui lòng thử lại sau.');
    expect(within(alert).getByRole('link', { name: 'Về danh sách truyện' })).toHaveAttribute('href', '/novels');
  });
});

describe('PublicNovelPage reading progress', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  function renderPage(s = source()) {
    render(
      <MemoryRouter initialEntries={['/novels/summer']}>
        <Routes>
          <Route path="/novels/:slug" element={<PublicNovelPage source={s} />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('offers to continue from the stored chapter, or to start over', async () => {
    localStorage.setItem('novel-progress:summer', JSON.stringify({ chapterNo: 3 }));
    renderPage();

    const resume = await screen.findByRole('link', { name: 'Đọc tiếp: Ngoại truyện 1' });
    expect(resume).toHaveAttribute('href', '/novels/summer/3');
    expect(screen.getByRole('link', { name: 'Đọc từ đầu' })).toHaveAttribute('href', '/novels/summer/1');
    expect(screen.queryByRole('link', { name: 'Bắt đầu đọc' })).not.toBeInTheDocument();
  });

  it('says Bắt đầu đọc without stored progress', async () => {
    renderPage();

    expect(await screen.findByRole('link', { name: 'Bắt đầu đọc' })).toHaveAttribute('href', '/novels/summer/1');
    expect(screen.queryByRole('link', { name: /Đọc tiếp/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Đọc từ đầu' })).not.toBeInTheDocument();
  });

  it('says Bắt đầu đọc, with no broken link, when the stored chapter is no longer published', async () => {
    localStorage.setItem('novel-progress:summer', JSON.stringify({ chapterNo: 99 }));
    renderPage();

    expect(await screen.findByRole('link', { name: 'Bắt đầu đọc' })).toHaveAttribute('href', '/novels/summer/1');
    expect(screen.queryByRole('link', { name: /Đọc tiếp/ })).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/novels/summer/99"]')).toBeNull();
    expect(screen.queryByText('Đang đọc')).not.toBeInTheDocument();
  });

  it('marks read chapters and the one being read', async () => {
    localStorage.setItem('novel-progress:summer', JSON.stringify({ chapterNo: 3 }));
    localStorage.setItem('novel-read:summer', JSON.stringify([1, 3]));
    renderPage();

    const items = within(await screen.findByRole('list', { name: 'Danh sách chương' })).getAllByRole('listitem');
    expect(within(items[0]).getByRole('img', { name: 'Đã đọc' })).toBeInTheDocument();
    expect(items[0]).toHaveClass('chapter-list__item--read');
    expect(within(items[0]).queryByText('Đang đọc')).not.toBeInTheDocument();
    expect(within(items[1]).getByText('Đang đọc')).toBeInTheDocument();
    expect(within(items[1]).getByRole('img', { name: 'Đã đọc' })).toBeInTheDocument();
  });

  it('leaves unread chapters unmarked', async () => {
    renderPage();

    const items = within(await screen.findByRole('list', { name: 'Danh sách chương' })).getAllByRole('listitem');
    expect(within(items[0]).queryByRole('img', { name: 'Đã đọc' })).not.toBeInTheDocument();
    expect(items[0]).not.toHaveClass('chapter-list__item--read');
  });

  it('still renders with the defaults when localStorage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderPage();

    expect(await screen.findByRole('link', { name: 'Bắt đầu đọc' })).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Danh sách chương' })).getAllByRole('link')).toHaveLength(2);
  });
});
