import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrollToProgress, useScrollProgress } from './useScrollProgress';

function setup(top: number, height: number, innerHeight: number) {
  const el = document.createElement('div');
  // `top` is the element's offset in the document; the viewport-relative top moves with the scroll.
  el.getBoundingClientRect = () => ({ top: top - window.scrollY, height }) as DOMRect;
  vi.stubGlobal('innerHeight', innerHeight);
  return el;
}
function scrollTo(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  fireEvent.scroll(window);
}
afterEach(() => {
  vi.unstubAllGlobals();
  scrollTo(0);
});

async function frame() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 40));
  });
}

describe('useScrollProgress', () => {
  it('0 at top, 0.5 halfway, 1 at end', async () => {
    const el = setup(0, 2000, 1000);
    const { result } = renderHook(() => useScrollProgress({ current: el }));
    await frame();
    expect(result.current).toBe(0);
    scrollTo(500);
    await frame();
    expect(result.current).toBeCloseTo(0.5);
    scrollTo(1000);
    await frame();
    expect(result.current).toBe(1);
  });

  it('content shorter than the viewport is 1', async () => {
    const el = setup(0, 500, 1000);
    const { result } = renderHook(() => useScrollProgress({ current: el }));
    await frame();
    expect(result.current).toBe(1);
  });

  it('scrollToProgress scrolls to the matching offset', () => {
    const el = setup(100, 2000, 1000);
    const spy = vi.fn();
    vi.stubGlobal('scrollTo', spy);
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    scrollToProgress(el, 0.5);
    expect(spy).toHaveBeenCalledWith({ top: 600 });
  });
});
