import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShortcutsHelp } from './ShortcutsHelp';

function stubTouch(touch: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: touch && query === '(hover: none) and (pointer: coarse)',
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe('ShortcutsHelp', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('on a touch screen the button is Caption size and the popover has only the size choice, no keys', () => {
    stubTouch(true);
    render(<ShortcutsHelp open onOpenChange={() => {}} playlist />);

    expect(screen.getByRole('button', { name: 'Caption size' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keyboard shortcuts' })).not.toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Caption size' })).toBeInTheDocument();
    expect(screen.queryByText('Play / pause')).not.toBeInTheDocument();
    expect(document.querySelector('kbd')).toBeNull();
  });

  it('with a keyboard and open: the keys are listed next to the caption size', () => {
    stubTouch(false);
    render(<ShortcutsHelp open onOpenChange={() => {}} playlist />);

    expect(screen.getByText('Play / pause')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Caption size' })).toBeInTheDocument();
  });
});
