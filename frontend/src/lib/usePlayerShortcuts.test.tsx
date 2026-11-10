import { fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePlayerShortcuts } from './usePlayerShortcuts';

function setup() {
  const h = {
    togglePlay: vi.fn(),
    seekBy: vi.fn(),
    toggleMute: vi.fn(),
    toggleCaptions: vi.fn(),
    toggleHelp: vi.fn(),
  };
  const view = renderHook(() => usePlayerShortcuts(h));
  return { h, ...view };
}

const press = (key: string, init: KeyboardEventInit = {}, target: Element | Document = document.body) =>
  fireEvent.keyDown(target, { key, ...init });

describe('usePlayerShortcuts', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('maps K and Space to play/pause, J/L and arrows to seeking, M to mute, C to captions, ? to help', () => {
    const { h } = setup();
    press('k');
    press(' ');
    expect(h.togglePlay).toHaveBeenCalledTimes(2);
    press('j');
    expect(h.seekBy).toHaveBeenLastCalledWith(-10);
    press('l');
    expect(h.seekBy).toHaveBeenLastCalledWith(10);
    press('ArrowLeft');
    expect(h.seekBy).toHaveBeenLastCalledWith(-5);
    press('ArrowRight');
    expect(h.seekBy).toHaveBeenLastCalledWith(5);
    press('m');
    expect(h.toggleMute).toHaveBeenCalledTimes(1);
    press('c');
    expect(h.toggleCaptions).toHaveBeenCalledTimes(1);
    press('?', { shiftKey: true });
    expect(h.toggleHelp).toHaveBeenCalledTimes(1);
  });

  it('is case-insensitive for letters', () => {
    const { h } = setup();
    press('K');
    expect(h.togglePlay).toHaveBeenCalledTimes(1);
  });

  it('prevents the default of a handled key (Space and arrows would scroll the page)', () => {
    setup();
    expect(press(' ')).toBe(false); // fireEvent returns false when preventDefault was called
    expect(press('x')).toBe(true);
  });

  it('ignores keys while the user types in a field', () => {
    const { h } = setup();
    const input = document.createElement('input');
    document.body.appendChild(input);
    press('k', {}, input);
    press(' ', {}, input);
    press('ArrowLeft', {}, input);
    expect(h.togglePlay).not.toHaveBeenCalled();
    expect(h.seekBy).not.toHaveBeenCalled();
  });

  it('ignores keys combined with Ctrl, Meta or Alt, and Shift+letter (Shift+N / Shift+P belong to the playlist)', () => {
    const { h } = setup();
    press('k', { ctrlKey: true });
    press('k', { metaKey: true });
    press('k', { altKey: true });
    press('ArrowLeft', { altKey: true });
    press('k', { shiftKey: true });
    press('ArrowRight', { shiftKey: true });
    expect(h.togglePlay).not.toHaveBeenCalled();
    expect(h.seekBy).not.toHaveBeenCalled();
  });

  it('leaves Space alone when focus is on a button or a link, but still handles K there', () => {
    const { h } = setup();
    const button = document.createElement('button');
    const link = document.createElement('a');
    link.href = '/x';
    document.body.append(button, link);
    expect(press(' ', {}, button)).toBe(true);
    expect(press(' ', {}, link)).toBe(true);
    expect(h.togglePlay).not.toHaveBeenCalled();
    press('k', {}, button);
    expect(h.togglePlay).toHaveBeenCalledTimes(1);
  });

  it('ignores keys pressed inside an open dialog or popover', () => {
    const { h } = setup();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const inner = document.createElement('span');
    dialog.appendChild(inner);
    document.body.appendChild(dialog);
    press('k', {}, inner);
    expect(h.togglePlay).not.toHaveBeenCalled();
  });

  it('stops listening on unmount', () => {
    const { h, unmount } = setup();
    unmount();
    press('k');
    expect(h.togglePlay).not.toHaveBeenCalled();
  });
});
