import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useScrollDirection } from './useScrollDirection';

function scrollTo(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  act(() => {
    window.dispatchEvent(new Event('scroll'));
  });
}

afterEach(() => scrollTo(0));

describe('useScrollDirection', () => {
  it('is visible and not scrolled at the top', () => {
    const { result } = renderHook(() => useScrollDirection());
    expect(result.current).toEqual({ hidden: false, scrolled: false });
  });

  it('marks scrolled as soon as scrollY > 0', () => {
    const { result } = renderHook(() => useScrollDirection());
    scrollTo(10);
    expect(result.current.scrolled).toBe(true);
    expect(result.current.hidden).toBe(false);
  });

  it('hides after scrolling down past 64 px by at least 8 px, and shows on scrolling up by 8 px', () => {
    const { result } = renderHook(() => useScrollDirection());
    scrollTo(60);
    expect(result.current.hidden).toBe(false);
    scrollTo(70);
    expect(result.current.hidden).toBe(true);
    scrollTo(66);
    expect(result.current.hidden).toBe(true); // a 4 px jitter up does not show it
    scrollTo(60);
    expect(result.current.hidden).toBe(false);
  });

  it('ignores a 4 px scroll down past the threshold', () => {
    const { result } = renderHook(() => useScrollDirection());
    scrollTo(60);
    scrollTo(66);
    expect(result.current.hidden).toBe(false);
  });

  it('shows again at the top', () => {
    const { result } = renderHook(() => useScrollDirection());
    scrollTo(200);
    expect(result.current.hidden).toBe(true);
    scrollTo(0);
    expect(result.current).toEqual({ hidden: false, scrolled: false });
  });

  it('is never hidden while locked', () => {
    const { result } = renderHook(() => useScrollDirection({ locked: true }));
    scrollTo(300);
    expect(result.current.hidden).toBe(false);
  });
});
