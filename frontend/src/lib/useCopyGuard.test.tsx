import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { useCopyGuard } from './useCopyGuard';

function Guarded() {
  const ref = useRef<HTMLDivElement>(null);
  const { hidden } = useCopyGuard(ref);
  return (
    <div ref={ref} data-hidden={hidden}>
      <img alt="page" src="/p.webp" />
      <p aria-live="polite">{hidden ? 'Content hidden while the window is inactive.' : ''}</p>
    </div>
  );
}

function keyDown(init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('useCopyGuard', () => {
  it('blocks the context menu, dragging and copying inside the area', () => {
    render(<Guarded />);
    const img = screen.getByRole('img', { name: 'page' });

    expect(fireEvent.contextMenu(img)).toBe(false);
    expect(fireEvent.dragStart(img)).toBe(false);
    expect(fireEvent.copy(img)).toBe(false);
    expect(fireEvent.cut(img)).toBe(false);
  });

  it('blocks copy, save, print, view-source and select-all shortcuts but not find', () => {
    render(<Guarded />);

    expect(keyDown({ key: 'c', ctrlKey: true })).toBe(true);
    expect(keyDown({ key: 's', metaKey: true })).toBe(true);
    expect(keyDown({ key: 'P', ctrlKey: true, shiftKey: true })).toBe(true);
    expect(keyDown({ key: 'u', ctrlKey: true })).toBe(true);
    expect(keyDown({ key: 'a', ctrlKey: true })).toBe(true);
    expect(keyDown({ key: 'f', ctrlKey: true })).toBe(false);
    expect(keyDown({ key: 'c' })).toBe(false);
  });

  it('hides the content while the window is inactive', () => {
    const { container } = render(<Guarded />);
    const area = container.firstElementChild!;

    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(area).toHaveAttribute('data-hidden', 'true');
    expect(screen.getByText('Content hidden while the window is inactive.')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(area).toHaveAttribute('data-hidden', 'false');
  });

  it('stops listening after unmount', () => {
    const { unmount } = render(<Guarded />);
    unmount();

    expect(keyDown({ key: 'c', ctrlKey: true })).toBe(false);
  });
});
