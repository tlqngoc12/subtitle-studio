import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ReaderBottomBar } from './ReaderBottomBar';

function setup(over: Partial<React.ComponentProps<typeof ReaderBottomBar>> = {}) {
  const props = {
    slug: 'summer',
    prev: 1 as number | null,
    next: 4 as number | null,
    progress: 0.25,
    onSeek: vi.fn(),
    onToc: vi.fn(),
    onSettings: vi.fn(),
    hidden: false,
    position: { index: 2, total: 3 },
    ...over,
  };
  render(
    <MemoryRouter>
      <ReaderBottomBar {...props} />
    </MemoryRouter>,
  );
  return props;
}

describe('ReaderBottomBar', () => {
  it('links prev and next, and shows the position', () => {
    setup();
    expect(screen.getByRole('link', { name: 'Chương trước' })).toHaveAttribute('href', '/novels/summer/1');
    expect(screen.getByRole('link', { name: 'Chương sau' })).toHaveAttribute('href', '/novels/summer/4');
    expect(screen.getByText('2/3')).toBeInTheDocument();
  });

  it('prev/next disabled at ends', () => {
    setup({ prev: null, next: null });
    expect(screen.getByRole('button', { name: 'Chương trước' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Chương sau' })).toBeDisabled();
  });

  it('moving the slider calls onSeek(0.5)', () => {
    const p = setup();
    fireEvent.change(screen.getByRole('slider', { name: 'Vị trí trong chương' }), { target: { value: '500' } });
    expect(p.onSeek).toHaveBeenCalledWith(0.5);
  });

  it('toc calls onToc, Aa calls onSettings', async () => {
    const p = setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Mục lục' }));
    await user.click(screen.getByRole('button', { name: 'Hiển thị' }));
    expect(p.onToc).toHaveBeenCalled();
    expect(p.onSettings).toHaveBeenCalled();
  });

  it('has data-hidden when hidden', () => {
    setup({ hidden: true });
    expect(document.querySelector('.reader-bottom')).toHaveAttribute('data-hidden');
  });

  it('omits the position text without a position', () => {
    setup({ position: null });
    expect(screen.queryByText(/\d+\/\d+/)).toBeNull();
  });
});
