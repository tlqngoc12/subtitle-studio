import { render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTopbarHeight } from './useTopbarHeight';

function Bar() {
  const ref = useRef<HTMLElement>(null);
  useTopbarHeight(ref);
  return <header ref={ref}>bar</header>;
}

const rootVar = () => document.documentElement.style.getPropertyValue('--topbar-h');

describe('useTopbarHeight', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sets --topbar-h from the measured height, follows resizes and clears on unmount', () => {
    let height = 57;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ height }) as DOMRect);
    let callback: () => void = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          callback = cb;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const { unmount } = render(<Bar />);
    expect(rootVar()).toBe('57px');
    height = 98;
    callback();
    expect(rootVar()).toBe('98px');
    unmount();
    expect(rootVar()).toBe('');
    expect(disconnect).toHaveBeenCalled();
  });

  it('does not crash without ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ height: 60 }) as DOMRect);
    const { unmount } = render(<Bar />);
    expect(rootVar()).toBe('60px');
    unmount();
    expect(rootVar()).toBe('');
  });
});
