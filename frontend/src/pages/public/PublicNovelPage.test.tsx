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
  it('shows a card per novel', async () => {
    render(
      <MemoryRouter>
        <PublicNovelsPage source={source()} />
      </MemoryRouter>,
    );

    const card = await screen.findByRole('link', { name: /Tình Yêu Mùa Hạ/ });
    expect(card).toHaveAttribute('href', '/novels/summer');
    expect(within(card).getByText('2 chapters')).toBeInTheDocument();
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
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('BL')).toBeInTheDocument();
    expect(screen.getByText('Dịch: @byZenQN')).toBeInTheDocument();
    expect(screen.getByText('Một mùa hè đáng nhớ.')).toBeInTheDocument();
    const original = screen.getByRole('link', { name: 'Original book' });
    expect(original).toHaveAttribute('href', 'https://example.com/book');
    expect(original).toHaveAttribute('rel', 'noopener noreferrer');
    const chapters = within(screen.getByRole('list', { name: 'Chapters' })).getAllByRole('link');
    expect(chapters.map((a) => a.textContent)).toEqual(['Chapter 1: Mở đầu', 'Ngoại truyện 1']);
    expect(chapters[1]).toHaveAttribute('href', '/novels/summer/3');
    expect(screen.getByRole('link', { name: 'Read chapter 1' })).toHaveAttribute('href', '/novels/summer/1');
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

    expect(await screen.findByRole('alert')).toHaveTextContent('This novel no longer exists.');
  });
});
