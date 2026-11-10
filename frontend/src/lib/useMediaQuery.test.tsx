import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { COMPACT_QUERY, useMediaQuery } from './useMediaQuery';

afterEach(() => vi.unstubAllGlobals());

it('useMediaQuery follows change events', () => {
  let matches = false;
  const listeners = new Set<() => void>();
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return matches;
    },
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }));

  const { result } = renderHook(() => useMediaQuery(COMPACT_QUERY));
  expect(result.current).toBe(false);
  act(() => {
    matches = true;
    listeners.forEach((fn) => fn());
  });
  expect(result.current).toBe(true);
});
