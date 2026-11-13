import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageSkeleton, SkeletonGrid, SkeletonList } from './Skeleton';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Skeleton', () => {
  it('shows nothing for the first 150 ms, then the grid', () => {
    const { container } = render(<SkeletonGrid count={6} aspect="3/4" />);
    expect(container.querySelectorAll('.skeleton')).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(container.querySelectorAll('.skeleton')).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(container.querySelectorAll('.skeleton')).toHaveLength(6);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });

  it('shapes a page loading state like a header plus a list, announced once as a status', () => {
    const { container } = render(<PageSkeleton rows={3} />);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(container.querySelectorAll('.skeleton-row')).toHaveLength(3);
    expect(container.querySelector('.page-skeleton__title')).not.toBeNull();
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('shows the requested number of list rows after the delay', () => {
    const { container } = render(<SkeletonList rows={4} />);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(container.querySelectorAll('.skeleton-row')).toHaveLength(4);
  });
});
