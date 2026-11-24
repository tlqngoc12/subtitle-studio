import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Download } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { css } from '../../test/css';
import { expectTooltip } from '../../test/tooltip';
import { ChapterBar, saveStateText, type ChapterBarProps, type SaveState } from './ChapterBar';

function bar(over: Partial<ChapterBarProps> = {}) {
  const props: ChapterBarProps = {
    nav: <a href="/prev">prev</a>,
    title: 'Chapter 19',
    badges: <span>Translated</span>,
    saveState: { kind: 'idle' },
    canSave: false,
    onSave: vi.fn(),
    publish: { onPublish: vi.fn(), disabledReason: null },
    menuItems: [{ label: 'Translate again', onSelect: vi.fn(), danger: true }],
    ...over,
  };
  const view = render(<ChapterBar {...props} />);
  return { ...view, props };
}

const primaries = (container: HTMLElement) =>
  [...container.querySelectorAll('.button--primary')].map((b) => b.textContent);

describe('ChapterBar primary button', () => {
  const states: [string, Partial<ChapterBarProps>, string[]][] = [
    ['a clean Draft: none (Publish lives in the menu)', {}, []],
    ['a dirty Draft: Save', { saveState: { kind: 'dirty' }, canSave: true }, ['Save']],
    ['a saving Draft: Save', { saveState: { kind: 'saving' }, canSave: false }, ['Save']],
    ['a clean Published chapter: none', { publish: undefined, menuItems: [{ label: 'Unpublish', onSelect: vi.fn() }] }, []],
    ['a dirty Published chapter: Save', { publish: undefined, saveState: { kind: 'dirty' }, canSave: true }, ['Save']],
  ];
  it.each(states)('has at most one primary: %s', (_name, over, expected) => {
    const { container } = bar(over);

    expect(primaries(container)).toEqual(expected);
  });
});

describe('ChapterBar Save and Publish', () => {
  it('disables Save when there is nothing to save, and calls onSave otherwise', async () => {
    const { props, rerender } = bar();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    rerender(<ChapterBar {...props} saveState={{ kind: 'dirty' }} canSave />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save' }));

    expect(props.onSave).toHaveBeenCalledOnce();
  });

  it('has no Publish button outside the menu', () => {
    bar();

    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
  });

  it('disables Publish in the menu with a "Save first" tooltip while there are unsaved changes', async () => {
    bar({ saveState: { kind: 'dirty' }, canSave: true });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Chapter actions' }));
    const publish = await screen.findByRole('button', { name: 'Publish' });

    expect(publish).toBeDisabled();
    await expectTooltip(publish.parentElement!, 'Save first');
  });

  it('disables Publish with the given reason when clean', async () => {
    bar({ publish: { onPublish: vi.fn(), disabledReason: 'Wait until this chapter finishes translating.' } });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Chapter actions' }));
    const publish = await screen.findByRole('button', { name: 'Publish' });

    expect(publish).toBeDisabled();
    await expectTooltip(publish.parentElement!, 'Wait until this chapter finishes translating.');
  });

  it('publishes from the menu', async () => {
    const { props } = bar();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Chapter actions' }));
    await user.click(await screen.findByRole('button', { name: 'Publish' }));

    expect(props.publish!.onPublish).toHaveBeenCalledOnce();
  });
});

describe('ChapterBar menu', () => {
  it('lists the given items; a danger item is red; choosing one runs it and closes the menu', async () => {
    const onSelect = vi.fn();
    bar({ menuItems: [{ label: 'Translate again', onSelect, danger: true }, { label: 'Reload original', onSelect: vi.fn() }] });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Chapter actions' }));
    const again = await screen.findByRole('button', { name: 'Translate again' });
    expect(again).toHaveClass('member-menu__item--danger');
    expect(screen.getByRole('button', { name: 'Reload original' })).not.toHaveClass('member-menu__item--danger');
    await user.click(again);

    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Reload original' })).not.toBeInTheDocument();
  });

  it('can disable an item', async () => {
    bar({ menuItems: [{ label: 'Unpublish', onSelect: vi.fn(), disabled: true }] });

    await userEvent.setup().click(screen.getByRole('button', { name: 'Chapter actions' }));

    expect(await screen.findByRole('button', { name: 'Unpublish' })).toBeDisabled();
  });

  it('has a tooltip', async () => {
    bar();

    await expectTooltip(screen.getByRole('button', { name: 'Chapter actions' }), 'Chapter actions');
  });

  it('has Publish as the first item, before the given ones', async () => {
    bar();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Chapter actions' }));
    const list = (await screen.findByRole('button', { name: 'Translate again' })).closest('.member-menu__list') as HTMLElement;

    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual(['Publish', 'Translate again']);
  });

  it('shows an item icon when given', async () => {
    bar({ menuItems: [{ label: 'Export chapter', onSelect: vi.fn(), icon: Download }] });

    await userEvent.setup().click(screen.getByRole('button', { name: 'Chapter actions' }));

    expect((await screen.findByRole('button', { name: 'Export chapter' })).querySelector('svg')).not.toBeNull();
  });

  it('always shows the menu button, on any width', () => {
    bar({ publish: undefined, menuItems: [{ label: 'Export chapter', onSelect: vi.fn() }] });

    expect(screen.getByRole('button', { name: 'Chapter actions' })).not.toHaveClass('chapter-bar__menu--phone-only');
  });
});

describe('ChapterBar save state', () => {
  const at = new Date('2026-11-15T03:32:00Z'); // 10:32 in Vietnam

  it('has the texts for every state', () => {
    const text = (s: SaveState) => saveStateText(s);
    expect(text({ kind: 'idle' })).toBe('');
    expect(text({ kind: 'dirty' })).toBe('Unsaved changes');
    expect(text({ kind: 'saving' })).toBe('Saving…');
    expect(text({ kind: 'saved', at })).toBe('Saved 10:32');
    expect(text({ kind: 'autosaved', at })).toBe('Auto-saved 10:32');
  });

  it('shows the text in a polite live region', () => {
    bar({ saveState: { kind: 'saved', at } });

    const live = screen.getByText('Saved 10:32');
    expect(live).toHaveAttribute('aria-live', 'polite');
  });
});

describe('ChapterBar layout', () => {
  it('is sticky at the top', () => {
    expect(css).toMatch(/\.chapter-bar\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0/);
  });

  it('shows the name in the bar, and leaves it out (keeping the badges) while the page H1 is on screen', () => {
    const { rerender, props } = bar();
    expect(screen.getByText('Chapter 19')).toBeInTheDocument();

    rerender(<ChapterBar {...props} titleHidden />);
    expect(screen.queryByText('Chapter 19')).not.toBeInTheDocument();
    expect(screen.getByText('Translated')).toBeInTheDocument();
  });

  it('on phones hides the title, and puts the save state on its own row', () => {
    expect(css).toMatch(/\.chapter-bar__name\s*\{[^}]*display:\s*none/);
    expect(css).toMatch(/\.chapter-bar__state\s*\{[^}]*flex:\s*1 0 100%/);
  });
});

describe('ChapterBar on one row', () => {
  it('puts the save state before the actions, so on desktop it sits next to them on the right', () => {
    const { container } = bar({ saveState: { kind: 'dirty' } });
    const state = container.querySelector('.chapter-bar__state')!;
    const actions = container.querySelector('.chapter-bar__actions')!;

    expect(state.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('is a single non-wrapping row from 761 px, with the state and actions pushed right', () => {
    const block = css.slice(css.indexOf('@media (min-width: 761px)', css.indexOf('.chapter-bar__state')));
    expect(block).toMatch(/\.chapter-bar\s*\{[^}]*flex-wrap:\s*nowrap/);
    expect(block).toMatch(/\.chapter-bar__state\s*\{[^}]*margin-left:\s*auto/);
  });

  it('has the page background and a bottom rule', () => {
    expect(css).toMatch(/\.chapter-bar\s*\{[^}]*background:\s*var\(--paper\)/);
    expect(css).toMatch(/\.chapter-bar\s*\{[^}]*border-bottom:\s*1px solid var\(--rule\)/);
  });
});

describe('ChapterBar on a phone while the find panel is open', () => {
  it('hides the nav slot and the save-state line, and shows them again from 521 px', () => {
    expect(css).toMatch(/\.chapter-bar--with-below \.chapter-bar__nav,\s*\.chapter-bar--with-below \.chapter-bar__state\s*\{[^}]*display:\s*none/);
    const wide = css.slice(css.indexOf('@media (min-width: 521px)', css.indexOf('.chapter-bar--with-below .chapter-bar__nav')));
    expect(wide).toMatch(/\.chapter-bar--with-below \.chapter-bar__nav\s*\{[^}]*display:\s*inline-flex/);
    expect(wide).toMatch(/\.chapter-bar--with-below \.chapter-bar__state\s*\{[^}]*display:\s*revert/);
  });
});

describe('ChapterBar height tracking', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('writes its measured height to --chapter-bar-h on its parent and stops observing on unmount', () => {
    let notify: () => void = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          notify = cb;
        }
        observe() {}
        unobserve() {}
        disconnect = disconnect;
      },
    );
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ height: 180 } as DOMRect);

    const { container, unmount } = bar();
    notify();

    expect((container as HTMLElement).style.getPropertyValue('--chapter-bar-h')).toBe('180px');
    unmount();
    expect(disconnect).toHaveBeenCalled();
    rect.mockRestore();
  });
});
