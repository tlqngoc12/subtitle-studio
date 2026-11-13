import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NovelSource } from '../../data/novelSource';
import type { PublicChapterFile, PublicNovelDetail, PublicNovelSummary } from '../../data/novelTypes';
import PublicNovelPage from './PublicNovelPage';
import ReaderPage from './ReaderPage';

const reads = vi.hoisted(() => ({ counts: null as Record<string, number> | null, recordRead: vi.fn() }));
vi.mock('../../data/novelReads', async (original) => ({
  ...(await original<typeof import('../../data/novelReads')>()),
  useReadCounts: () => reads.counts,
  recordRead: reads.recordRead,
}));

const SUMMARY: PublicNovelSummary = {
  slug: 'summer',
  title: 'Mùa Hạ',
  coverUrl: null,
  originalAuthor: null,
  tags: [],
  novelStatus: 'ONGOING',
  publishedCount: 2,
  totalChapters: 5,
  lastPublishedAt: null,
  updatedAt: '2026-11-05T10:00:00Z',
};
const DETAIL: PublicNovelDetail = {
  slug: 'summer',
  title: 'Mùa Hạ',
  coverUrl: null,
  originalAuthor: null,
  description: null,
  tags: [],
  novelStatus: 'ONGOING',
  translatorCredit: null,
  sourceUrl: null,
  trailerVideoId: null,
  chapters: [{ chapterNo: 1, title: 'Mở đầu' }],
};
const CHAPTER: PublicChapterFile = {
  chapterNo: 1,
  title: 'Mở đầu',
  label: null,
  prev: null,
  next: null,
  images: ['/novels/summer/a.webp'],
};
const source: NovelSource = {
  listNovels: async () => [SUMMARY],
  getNovel: async () => DETAIL,
  getChapter: async () => CHAPTER,
};

beforeEach(() => {
  reads.counts = null;
  reads.recordRead.mockClear();
});

describe('read counts on the public site', () => {
  it('shows the total on the novel page and hides it without counts', async () => {
    const page = (
      <MemoryRouter initialEntries={['/novels/summer']}>
        <Routes>
          <Route path="/novels/:slug" element={<PublicNovelPage source={source} />} />
        </Routes>
      </MemoryRouter>
    );
    const { unmount } = render(page);
    await screen.findByRole('heading', { name: 'Mùa Hạ' });
    expect(screen.queryByText(/lượt đọc/)).not.toBeInTheDocument();
    unmount();

    reads.counts = { summer: 15600 };
    render(page);
    expect(await screen.findByText('15,6 N lượt đọc')).toBeInTheDocument();
  });

  it('records a read once the chapter has loaded', async () => {
    render(
      <MemoryRouter initialEntries={['/novels/summer/1']}>
        <Routes>
          <Route path="/novels/:slug/:chapterNo" element={<ReaderPage source={source} />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(reads.recordRead).toHaveBeenCalledWith('summer', 1));
    expect(reads.recordRead).toHaveBeenCalledTimes(1);
  });

  it('does not record a read when the chapter fails to load', async () => {
    const failing: NovelSource = {
      ...source,
      getChapter: async () => {
        throw new Error('404');
      },
    };
    render(
      <MemoryRouter initialEntries={['/novels/summer/9']}>
        <Routes>
          <Route path="/novels/:slug/:chapterNo" element={<ReaderPage source={failing} />} />
        </Routes>
      </MemoryRouter>,
    );

    await new Promise((r) => setTimeout(r, 20));
    expect(reads.recordRead).not.toHaveBeenCalled();
  });
});
