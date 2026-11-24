import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useScrollableTabs } from './useScrollableTabs';

function Tabs({ open }: { open: string }) {
  const ref = useScrollableTabs<HTMLElement>();
  return (
    <nav ref={ref} aria-label="tabs">
      {['a', 'b', 'c'].map((id) => (
        <a key={id} href={`#${id}`} aria-current={id === open ? 'page' : undefined}>
          {id}
        </a>
      ))}
    </nav>
  );
}

/** jsdom has no layout: give the row and the tabs a size so the centring maths has numbers. */
function layout(nav: HTMLElement) {
  Object.defineProperty(nav, 'clientWidth', { configurable: true, value: 300 });
  Object.defineProperty(nav, 'scrollWidth', { configurable: true, value: 900 });
  [...nav.querySelectorAll('a')].forEach((a, i) => {
    Object.defineProperty(a, 'offsetLeft', { configurable: true, value: i * 300 });
    Object.defineProperty(a, 'offsetWidth', { configurable: true, value: 300 });
  });
}

describe('useScrollableTabs', () => {
  it('centres the open tab when it changes, and marks which edges hide more tabs', async () => {
    const { rerender } = render(<Tabs open="a" />);
    const nav = screen.getByRole('navigation');
    layout(nav);
    await act(async () => rerender(<Tabs open="b" />));
    expect(nav.scrollLeft).toBe(300);
    await act(async () => rerender(<Tabs open="c" />));
    expect(nav.scrollLeft).toBe(600);
    expect(nav.dataset.fadeStart).toBe('true');
    expect(nav.dataset.fadeEnd).toBe('false');
  });
});
