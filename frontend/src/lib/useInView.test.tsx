import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInView } from './useInView';

let callback: IntersectionObserverCallback;

function Probe() {
  const [ref, inView] = useInView<HTMLHeadingElement>();
  return <h1 ref={ref}>{String(inView)}</h1>;
}

describe('useInView', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: IntersectionObserverCallback) {
          callback = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is null until the browser reports, then follows the element', () => {
    render(<Probe />);
    expect(screen.getByRole('heading')).toHaveTextContent('null');

    act(() => callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(screen.getByRole('heading')).toHaveTextContent('true');

    act(() => callback([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(screen.getByRole('heading')).toHaveTextContent('false');
  });
});
