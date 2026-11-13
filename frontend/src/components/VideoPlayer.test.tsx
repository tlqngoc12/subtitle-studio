import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VideoPlayer } from './VideoPlayer';

const COVER = 'width=device-width, initial-scale=1.0, viewport-fit=cover';
let meta: HTMLMetaElement;

function setup() {
  return render(<VideoPlayer containerRef={{ current: null }} cue={null} error={null} />);
}
const enter = () => fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));

describe('VideoPlayer viewport meta in filled mode', () => {
  beforeEach(() => {
    meta = document.createElement('meta');
    meta.name = 'viewport';
    meta.content = COVER;
    document.head.appendChild(meta);
  });
  afterEach(() => meta.remove());

  it('leaves the meta untouched without filled mode', () => {
    setup();
    expect(meta.content).toBe(COVER);
  });

  it('drops viewport-fit=cover when filled and keeps the rest', () => {
    setup();
    enter();
    expect(meta.content).toBe('width=device-width, initial-scale=1.0');
    expect(document.documentElement.classList.contains('player-filled-open')).toBe(true);
  });

  it('restores the exact original on the button', () => {
    setup();
    enter();
    fireEvent.click(screen.getByRole('button', { name: 'Exit full screen' }));
    expect(meta.content).toBe(COVER);
  });

  it('restores the exact original on Escape', () => {
    setup();
    enter();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(meta.content).toBe(COVER);
  });

  it('restores the original when unmounted while filled', () => {
    const { unmount } = setup();
    enter();
    unmount();
    expect(meta.content).toBe(COVER);
  });
});
