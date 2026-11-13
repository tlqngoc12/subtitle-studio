// TEMP(debug-ios-fullscreen)
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VideoPlayer } from './VideoPlayer';

const COVER = 'width=device-width, initial-scale=1.0, viewport-fit=cover';
let meta: HTMLMetaElement;

function setup() {
  render(<VideoPlayer containerRef={{ current: null }} cue={null} error={null} />);
}

describe('LayoutDebug', () => {
  beforeEach(() => {
    meta = document.createElement('meta');
    meta.name = 'viewport';
    meta.content = COVER;
    document.head.appendChild(meta);
  });
  afterEach(() => {
    meta.remove();
    window.history.replaceState({}, '', '/');
  });

  it('renders nothing without debug=layout', () => {
    setup();
    expect(document.querySelector('.layout-debug')).toBeNull();
  });

  it('renders the labels with debug=layout', () => {
    window.history.replaceState({}, '', '/?debug=layout');
    setup();
    const text = document.querySelector('.layout-debug')?.textContent ?? '';
    for (const label of ['filled', 'screen', 'inner', 'vv', 'safe', 'player', 'iframe', 'meta']) {
      expect(text).toContain(label);
    }
  });

  it('with fit=auto drops viewport-fit=cover while filled and restores it after', () => {
    window.history.replaceState({}, '', '/?debug=layout&fit=auto');
    setup();
    expect(meta.content).toBe(COVER);
    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    expect(meta.content).toBe('width=device-width, initial-scale=1.0');
    expect(document.body.style.background).toContain('rgb(0, 0, 0)');
    fireEvent.click(screen.getByRole('button', { name: 'Exit full screen' }));
    expect(meta.content).toBe(COVER);
  });

  it('keeps the meta untouched with debug=layout but no fit=auto', () => {
    window.history.replaceState({}, '', '/?debug=layout');
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    expect(meta.content).toBe(COVER);
  });
});
