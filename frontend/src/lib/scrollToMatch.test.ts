import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const caret = vi.hoisted(() => vi.fn());
vi.mock('textarea-caret', () => ({ default: caret }));

import { scrollMatchIntoView } from './scrollToMatch';

function field(): HTMLTextAreaElement {
  const el = document.createElement('textarea');
  el.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;
  return el;
}

beforeEach(() => {
  window.innerHeight = 800;
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

afterEach(() => {
  caret.mockReset();
});

describe('scrollMatchIntoView', () => {
  it('scrolls an off-screen match to just under the covered area', () => {
    caret.mockReturnValue({ top: 900, left: 0, height: 20 });

    scrollMatchIntoView(field(), 5, 150);

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 100 + 900 - 150 - 40 });
  });

  it('leaves a visible match alone', () => {
    caret.mockReturnValue({ top: 200, left: 0, height: 20 });

    scrollMatchIntoView(field(), 5, 150);

    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('scrolls a match hidden under the sticky bar', () => {
    caret.mockReturnValue({ top: 0, left: 0, height: 20 });

    scrollMatchIntoView(field(), 5, 150);

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 100 - 150 - 40 });
  });
});
