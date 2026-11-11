import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { staggerDelay } from '../../lib/motion';
import { Reveal } from './Reveal';

beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

function reduce(on: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: on,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
}

describe('Reveal', () => {
  it('starts hidden and shifted when motion is allowed', () => {
    reduce(false);
    render(<Reveal><p>Hello</p></Reveal>);
    const box = screen.getByText('Hello').parentElement!;
    expect(box.style.opacity).toBe('0');
  });

  it('renders the children with no motion props under reduced motion', () => {
    reduce(true);
    render(<Reveal><p>Hello</p></Reveal>);
    const box = screen.getByText('Hello').parentElement!;
    expect(box.getAttribute('style')).toBeNull();
  });

  it('renders as the given element and keeps the class', () => {
    reduce(true);
    render(<Reveal as="section" className="x"><p>Hello</p></Reveal>);
    const box = screen.getByText('Hello').parentElement!;
    expect(box.tagName).toBe('SECTION');
    expect(box).toHaveClass('x');
  });
});

describe('staggerDelay', () => {
  it('is 30 ms per item, capped at the 8th', () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(2)).toBeCloseTo(0.06);
    expect(staggerDelay(8)).toBeCloseTo(0.24);
    expect(staggerDelay(30)).toBeCloseTo(0.24);
  });
});
