import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardOpen } from './useKeyboardOpen';

const rootVar = (name: string) => document.documentElement.style.getPropertyValue(name);

/** A `visualViewport` stand-in with a writable height; `resize` changes it and fires the event. */
function stubViewport({ inner, visible }: { inner: number; visible: number }) {
  const target = new EventTarget();
  const vv = Object.assign(target, {
    height: visible,
    resize(h: number) {
      vv.height = h;
      target.dispatchEvent(new Event('resize'));
    },
  });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: inner });
  vi.stubGlobal('visualViewport', vv);
  return vv;
}

describe('useKeyboardOpen', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is false and publishes the height when the visible area is the whole window', () => {
    stubViewport({ inner: 844, visible: 844 });
    const { result } = renderHook(() => useKeyboardOpen());
    expect(result.current).toBe(false);
    expect(rootVar('--vv-height')).toBe('844px');
  });

  it('turns true when the visible area shrinks by more than 150 px, and back', () => {
    const vv = stubViewport({ inner: 844, visible: 844 });
    const { result } = renderHook(() => useKeyboardOpen());
    act(() => vv.resize(500));
    expect(result.current).toBe(true);
    expect(rootVar('--vv-height')).toBe('500px');
    act(() => vv.resize(844));
    expect(result.current).toBe(false);
  });

  it('stays false for a change of 150 px or less (address bar, rotation)', () => {
    const vv = stubViewport({ inner: 844, visible: 844 });
    const { result } = renderHook(() => useKeyboardOpen());
    act(() => vv.resize(694));
    expect(result.current).toBe(false);
  });

  it('removes --vv-height on unmount', () => {
    stubViewport({ inner: 844, visible: 600 });
    const { unmount } = renderHook(() => useKeyboardOpen());
    expect(rootVar('--vv-height')).toBe('600px');
    unmount();
    expect(rootVar('--vv-height')).toBe('');
  });

  it('does nothing without visualViewport', () => {
    vi.stubGlobal('visualViewport', undefined);
    const { result } = renderHook(() => useKeyboardOpen());
    expect(result.current).toBe(false);
    expect(rootVar('--vv-height')).toBe('');
  });
});
