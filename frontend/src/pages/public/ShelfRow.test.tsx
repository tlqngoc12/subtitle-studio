import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicNovelSummary } from '../../data/novelTypes';
import { SHELF_GAP, SHELF_ITEM_WIDTH, ShelfRow, fitCount } from './ShelfRow';

const novel = (n: number): PublicNovelSummary => ({
  slug: `n${n}`,
  title: `Truyện ${n}`,
  coverUrl: null,
  originalAuthor: null,
  tags: [],
  novelStatus: 'ONGOING',
  publishedCount: 1,
  updatedAt: '2026-10-01T10:00:00Z',
});
const EIGHT = [1, 2, 3, 4, 5, 6, 7, 8].map(novel);

/** A ResizeObserver whose callbacks the test fires with a chosen width. */
let observers: ((width: number) => void)[] = [];
class FakeResizeObserver {
  private cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe() {
    observers.push((width) =>
      this.cb([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver),
    );
  }
  disconnect() {
    observers = [];
  }
  unobserve() {}
}

beforeEach(() => {
  observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});
afterEach(() => vi.unstubAllGlobals());

const resize = (width: number) => act(() => observers.forEach((fire) => fire(width)));
const renderRow = (novels = EIGHT) =>
  render(
    <MemoryRouter>
      <ShelfRow novels={novels} />
    </MemoryRouter>,
  );

describe('fitCount', () => {
  it('counts the items of the fixed width that fit with the gap, at least one', () => {
    expect(fitCount(0)).toBe(1);
    expect(fitCount(SHELF_ITEM_WIDTH)).toBe(1);
    expect(fitCount(2 * SHELF_ITEM_WIDTH + SHELF_GAP)).toBe(2);
    expect(fitCount(2 * SHELF_ITEM_WIDTH + SHELF_GAP - 1)).toBe(1);
    expect(fitCount(1200)).toBe(5);
  });
});

describe('ShelfRow', () => {
  it('renders nothing for an empty shelf', () => {
    const { container } = renderRow([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders only the items that fit, so the others cannot be tabbed to', () => {
    renderRow();
    resize(1200); // 5 fit

    const shelf = screen.getByRole('region', { name: 'Tủ sách' });
    expect(within(shelf).getAllByRole('listitem')).toHaveLength(5);
    expect(within(shelf).queryByRole('link', { name: /Truyện 6/ })).not.toBeInTheDocument();
    // Every remaining link is a real, visible, focusable one: the title links plus "Xem tất cả".
    expect(within(shelf).getAllByRole('link')).toHaveLength(6);
  });

  it('shows fewer items when the row narrows and more when it widens', () => {
    renderRow();
    resize(400);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    resize(700);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    resize(3000);
    expect(screen.getAllByRole('listitem')).toHaveLength(8);
  });

  it('shows the total in "Xem tất cả (N)" even when only some items fit', () => {
    renderRow();
    resize(500);

    expect(screen.getByRole('link', { name: 'Xem tất cả (8)' })).toHaveAttribute('href', '/novels/shelf');
  });

  it('shows the reading progress when there is one and links to the novel', async () => {
    localStorage.setItem('novel-progress:n1', JSON.stringify({ chapterNo: 4 }));
    renderRow();
    resize(1200);

    expect(screen.getByText('Đang đọc Chương 4')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Truyện 1/ })).toHaveAttribute('href', '/novels/n1');
    expect(screen.getAllByText(/Đang đọc/)).toHaveLength(1);
    await userEvent.tab();
    localStorage.clear();
  });
});
