import { act, fireEvent, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useReaderChrome } from './useReaderChrome';

function scrollTo(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  fireEvent.scroll(window);
}

beforeEach(() => scrollTo(0));

describe('useReaderChrome', () => {
  it('hides on scroll down, shows on toggle, hides again on further scroll down', () => {
    const { result } = renderHook(() => useReaderChrome(false));
    expect(result.current.hidden).toBe(false);
    act(() => scrollTo(300));
    expect(result.current.hidden).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.hidden).toBe(false);
    act(() => scrollTo(500));
    expect(result.current.hidden).toBe(true);
    act(() => scrollTo(400));
    expect(result.current.hidden).toBe(false);
  });

  it('show() reveals it', () => {
    const { result } = renderHook(() => useReaderChrome(false));
    act(() => scrollTo(300));
    act(() => result.current.show());
    expect(result.current.hidden).toBe(false);
  });

  it('locked keeps it shown', () => {
    const { result, rerender } = renderHook(({ locked }) => useReaderChrome(locked), {
      initialProps: { locked: true },
    });
    act(() => scrollTo(300));
    expect(result.current.hidden).toBe(false);
    rerender({ locked: false });
    expect(result.current.hidden).toBe(true);
  });
});
