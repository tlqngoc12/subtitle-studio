import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { PublicNovelSummary } from '../../data/novelTypes';
import { NovelRow } from './NovelRow';
import { NovelTile } from './NovelTile';

const N: PublicNovelSummary = {
  slug: 'summer',
  title: 'Mùa Hạ',
  coverUrl: null,
  originalAuthor: null,
  tags: [],
  novelStatus: 'ONGOING',
  publishedCount: 2,
  totalChapters: 5,
  lastPublishedAt: null,
  updatedAt: '2020-01-05T10:00:00Z',
};

function inList(ui: React.ReactNode) {
  return render(
    <MemoryRouter>
      <ul>{ui}</ul>
    </MemoryRouter>,
  );
}

describe('NovelRow', () => {
  it('links to the novel with title, status and meta', () => {
    inList(<NovelRow novel={N} reads={1234} />);
    expect(screen.getByRole('link', { name: /Mùa Hạ/ })).toHaveAttribute('href', '/novels/summer');
    expect(screen.getByText('Đang ra')).toBeInTheDocument();
    expect(screen.getByText(/^2\/5 chương · /)).toBeInTheDocument();
    expect(screen.getByText('1,2 N lượt đọc')).toBeInTheDocument();
  });

  it('shows the continue link when continueNo is given', () => {
    inList(<NovelRow novel={N} continueNo={7} />);
    expect(screen.getByRole('link', { name: /Đọc tiếp: Chương 7/ })).toHaveAttribute('href', '/novels/summer/7');
  });

  it('has no continue link without continueNo', () => {
    inList(<NovelRow novel={N} />);
    expect(screen.queryByText(/Đọc tiếp/)).not.toBeInTheDocument();
  });
});

describe('NovelTile', () => {
  it('shows title, x/y chương and reads', () => {
    inList(<NovelTile novel={N} reads={5} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/novels/summer');
    expect(screen.getByText('2/5 chương')).toBeInTheDocument();
    expect(screen.getByText('5 lượt đọc')).toBeInTheDocument();
  });
});
