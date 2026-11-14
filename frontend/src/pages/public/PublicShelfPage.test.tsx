import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { NovelSource } from '../../data/novelSource';
import type { PublicNovelSummary } from '../../data/novelTypes';
import PublicShelfPage from './PublicShelfPage';

const novel = (n: number): PublicNovelSummary => ({
  slug: `n${n}`,
  title: `Truyện ${n}`,
  coverUrl: null,
  originalAuthor: null,
  tags: [],
  novelStatus: 'ONGOING',
  publishedCount: 1,
  totalChapters: 2,
  updatedAt: '2026-10-01T10:00:00Z',
});

function sourceOf(list: PublicNovelSummary[]): NovelSource {
  return {
    listNovels: async () => list,
    getNovel: async () => {
      throw new Error('not used');
    },
    getChapter: async () => {
      throw new Error('not used');
    },
  };
}

const renderPage = (list: PublicNovelSummary[]) =>
  render(
    <MemoryRouter>
      <PublicShelfPage source={sourceOf(list)} />
    </MemoryRouter>,
  );

beforeEach(() => localStorage.clear());
afterEach(() => {
  document.title = '';
});

describe('PublicShelfPage (/novels/shelf)', () => {
  it('lists every saved novel in shelf order as cards, skipping unknown slugs', async () => {
    localStorage.setItem('novel-shelf', JSON.stringify(['n5', 'gone', 'n1', 'n3', 'n2', 'n4', 'n6', 'n7']));
    renderPage([1, 2, 3, 4, 5, 6, 7, 8].map(novel));

    const list = await screen.findByRole('list', { name: 'Tủ sách' });
    const cards = within(list).getAllByRole('listitem');
    expect(cards.map((li) => within(li).getByRole('link').getAttribute('href'))).toEqual([
      '/novels/n5', '/novels/n1', '/novels/n3', '/novels/n2', '/novels/n4', '/novels/n6', '/novels/n7',
    ]);
    expect(within(cards[0]).getByText('Đang ra')).toBeInTheDocument();
    expect(within(cards[0]).getByText('Chương').closest('.fanfic-stat')?.querySelector('.fanfic-stat__value')).toHaveTextContent(/^1 chương$/);
    expect(document.title).toBe('Tủ sách');
  });

  it('has the breadcrumb Novels > Tủ sách and an H1', async () => {
    renderPage([novel(1)]);

    expect(screen.getByRole('heading', { level: 1, name: 'Tủ sách' })).toBeInTheDocument();
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Novels' })).toHaveAttribute('href', '/novels');
    expect(within(crumbs).getByText('Tủ sách')).toHaveAttribute('aria-current', 'page');
    await screen.findByText('Chưa có truyện nào trong tủ sách.');
  });

  it('says so when the shelf is empty', async () => {
    renderPage([novel(1)]);

    expect(await screen.findByText('Chưa có truyện nào trong tủ sách.')).toBeInTheDocument();
  });

  it('shows the Vietnamese notice when the list cannot be loaded', async () => {
    render(
      <MemoryRouter>
        <PublicShelfPage source={{ ...sourceOf([]), listNovels: () => Promise.reject(new Error('x')) }} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Không tải được. Vui lòng thử lại sau.');
  });
});
