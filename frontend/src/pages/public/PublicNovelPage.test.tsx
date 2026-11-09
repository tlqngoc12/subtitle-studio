import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
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

    expect(await screen.findByText('Đang ra')).toBeInTheDocument();
  });

  it('shows a card per novel', async () => {
    render(
      <MemoryRouter>
        <PublicNovelsPage source={source()} />
      </MemoryRouter>,
    );

    const card = await screen.findByRole('link', { name: /Tình Yêu Mùa Hạ/ });
    expect(card).toHaveAttribute('href', '/novels/summer');
    expect(within(card).getByText('2 chương')).toBeInTheDocument();
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
