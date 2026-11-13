import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoPlayer } from './VideoPlayer';

function setup(onRefreshSize: () => void) {
  const ref = { current: null as HTMLDivElement | null };
  render(<VideoPlayer containerRef={ref} cue={null} error={null} onRefreshSize={onRefreshSize} />);
}

/** jsdom has no Fullscreen API, so the Full screen button puts the frame in filled mode (like iPhone Safari). */
function fill() {
  fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
}

describe('VideoPlayer filled mode', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] });
  });
  afterEach(() => vi.useRealTimers());

  it('does not ask the player to re-measure while not filled', () => {
    const refresh = vi.fn();
    setup(refresh);
    act(() => {
      vi.advanceTimersByTime(1000);
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(1000);
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('re-measures after entering filled mode, once layout has settled', () => {
    const refresh = vi.fn();
    setup(refresh);
    fill();
    expect(refresh).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(100));
    expect(refresh).toHaveBeenCalledTimes(1); // after two animation frames
    act(() => void vi.advanceTimersByTime(300));
    expect(refresh).toHaveBeenCalledTimes(2); // and once more after the rotation animation
  });

  it('re-measures after a resize or an orientation change', () => {
    const refresh = vi.fn();
    setup(refresh);
    fill();
    act(() => void vi.advanceTimersByTime(1000));
    refresh.mockClear();

    act(() => {
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('orientationchange'));
      vi.advanceTimersByTime(1000);
    });
    expect(refresh).toHaveBeenCalledTimes(2); // debounced into one frame call and one timer call
  });

  it('stops listening once filled mode is left', () => {
    const refresh = vi.fn();
    setup(refresh);
    fill();
    act(() => void vi.advanceTimersByTime(1000));
    fireEvent.click(screen.getByRole('button', { name: 'Exit full screen' }));
    refresh.mockClear();

    act(() => {
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(1000);
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});
