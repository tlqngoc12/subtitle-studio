import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { NovelSource } from '../../data/novelSource';
import type { PublicChapterFile, PublicNovelDetail } from '../../data/novelTypes';
import ReaderPage from './ReaderPage';

const NOVEL: PublicNovelDetail = {
  slug: 'summer',
  title: 'Tình Yêu Mùa Hạ',
  coverUrl: null,
  originalAuthor: null,
  description: null,
  tags: [],
  novelStatus: 'ONGOING',
  translatorCredit: null,
  sourceUrl: null,
  chapters: [
    { chapterNo: 1, title: 'Mở đầu' },
    { chapterNo: 3, title: 'Mưa' },
    { chapterNo: 4, title: null, label: 'Special' },
  ],
};

function chapter(no: number, prev: number | null, next: number | null): PublicChapterFile {
  return {
    chapterNo: no,
    title: no === 3 ? 'Mưa' : null,
    label: no === 4 ? 'Special' : null,
    prev,
    next,
    images: ['/novels/summer/h-1.webp', '/novels/summer/h-2.webp', '/novels/summer/h-3.webp'],
  };
}

const source: NovelSource = {
  listNovels: async () => [],
  getNovel: async () => NOVEL,
  getChapter: async (_slug, no) => (no === 3 ? chapter(3, 1, 4) : chapter(no, null, 3)),
};

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/novels/:slug" element={<p>novel page</p>} />
        <Route path="/novels/:slug/:chapterNo" element={<ReaderPage source={source} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ReaderPage', () => {
  it('shows every page image, lazily, not draggable', async () => {
    renderAt('/novels/summer/3');

    const images = await screen.findAllByRole('img', { name: /Chapter 3, page/ });
    expect(images).toHaveLength(3);
    expect(images[1]).toHaveAccessibleName('Chapter 3, page 2 of 3');
    expect(images[1]).toHaveAttribute('src', '/novels/summer/h-2.webp');
    expect(images[1]).toHaveAttribute('draggable', 'false');
    expect(images[1]).toHaveAttribute('loading', 'lazy');
    expect(screen.getByRole('heading', { name: 'Chapter 3: Mưa' })).toBeInTheDocument();
  });

  it('names a labelled chapter by its label', async () => {
    renderAt('/novels/summer/4');

    expect(await screen.findByRole('heading', { name: 'Special' })).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: /^Special, page/ })).toHaveLength(3);
    expect(screen.getAllByRole('option', { name: 'Special' }).length).toBeGreaterThan(0);
  });

  it('links to the previous and next chapters', async () => {
    renderAt('/novels/summer/3');

    const prev = await screen.findAllByRole('link', { name: 'Previous chapter' });
    expect(prev[0]).toHaveAttribute('href', '/novels/summer/1');
    expect(screen.getAllByRole('link', { name: 'Next chapter' })[0]).toHaveAttribute('href', '/novels/summer/4');
  });

  it('has no previous link on the first chapter', async () => {
    renderAt('/novels/summer/1');

    await screen.findAllByRole('img', { name: /Chapter 1, page/ });
    expect(screen.queryByRole('link', { name: 'Previous chapter' })).not.toBeInTheDocument();
  });

  it('jumps to another chapter from the list', async () => {
    renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chapter 3, page/ });

    await userEvent.setup().selectOptions(screen.getByLabelText('Chapter'), '4');

    expect(await screen.findAllByRole('img', { name: /^Special, page/ })).toHaveLength(3);
  });

  it('blocks the context menu on the pages', async () => {
    renderAt('/novels/summer/3');
    const images = await screen.findAllByRole('img', { name: /Chapter 3, page/ });

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    images[0].dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});
