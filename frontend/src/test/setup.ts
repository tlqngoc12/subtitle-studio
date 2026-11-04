import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, vi } from 'vitest';

// jsdom has no ResizeObserver; Radix (tooltips) measures its trigger with one.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom has no scrollIntoView; tests spy on it where scrolling matters.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

// jsdom has no matchMedia; sonner (toasts, theme="system") reads the colour scheme with it.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

afterEach(() => {
  toast.dismiss(); // sonner keeps toasts in a module-level store shared by all tests
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
