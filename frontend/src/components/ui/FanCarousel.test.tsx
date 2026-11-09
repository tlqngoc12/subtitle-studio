import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { css } from '../../test/css';
import { expectTooltip } from '../../test/tooltip';
import { FanCarousel, type FanItem } from './FanCarousel';

function item(key: string, over: Partial<FanItem> = {}): FanItem {
  return { key, src: `/media/${key}.png`, alt: `Alt ${key}`, ...over };
}

const ITEMS = [item('a'), item('b'), item('c')];

function renderFan(items: FanItem[] = ITEMS, props: Partial<Parameters<typeof FanCarousel>[0]> = {}) {
  return render(
    <MemoryRouter>
      <FanCarousel items={items} label="Ảnh nổi bật" {...props} />
    </MemoryRouter>,
  );
}

const counter = () => screen.getByText(/^\d\d \/ \d\d$/).textContent;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('FanCarousel', () => {
  it('fans the items: the current one in front, neighbours at signed distances', () => {
    renderFan();

    const region = screen.getByRole('region', { name: 'Ảnh nổi bật' });
    const items = ['a', 'b', 'c'].map((k) => within(region).getByRole('img', { name: `Alt ${k}`, hidden: true }).parentElement!);
    expect(items[0]).toHaveAttribute('aria-current', 'true');
    expect(items[1]).not.toHaveAttribute('aria-current');
    expect(items[0].style.getPropertyValue('--o')).toBe('0');
    expect(items[1].style.getPropertyValue('--o')).toBe('1');
    expect(items[2].style.getPropertyValue('--o')).toBe('-1');
    expect(items[2].style.getPropertyValue('--d')).toBe('1');
    expect(counter()).toBe('01 / 03');
  });

  it('is a plain group without a label (no region)', () => {
    renderFan(ITEMS, { label: undefined });

    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('puts the alt text on the image', () => {
    renderFan([item('a', { alt: '' }), item('b')]);

    const images = document.querySelectorAll('img');
    expect(images[0]).toHaveAttribute('alt', '');
    expect(images[1]).toHaveAttribute('alt', 'Alt b');
  });

  describe('items', () => {
    it('with href renders router links named by `name`', () => {
      renderFan([item('a', { href: '/novels/a', name: 'Truyện a' }), item('b', { href: '/novels/b', name: 'Truyện b' })]);

      expect(screen.getByRole('link', { name: 'Truyện a' })).toHaveAttribute('href', '/novels/a');
      expect(screen.getByRole('link', { name: 'Truyện b' })).toHaveAttribute('href', '/novels/b');
      expect(screen.queryByRole('button', { name: 'Truyện a' })).not.toBeInTheDocument();
    });

    it('with onOpen renders buttons that call it with the index', async () => {
      const onOpen = vi.fn();
      renderFan([item('a', { onOpen: () => onOpen(0) }), item('b', { onOpen: () => onOpen(1) })]);

      await userEvent.setup().click(screen.getByRole('button', { name: 'Alt b' }));

      expect(onOpen).toHaveBeenCalledWith(1);
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('is named by its alt text when there is no `name`, and by `name` when there is', () => {
      renderFan([item('a', { onOpen: () => {} }), item('b', { alt: '', name: 'Ảnh 2/2', onOpen: () => {} })]);

      expect(screen.getByRole('button', { name: 'Alt a' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Ảnh 2/2' })).toBeInTheDocument();
    });

    it('shows the empty-cover placeholder when an image has no src or fails to load', () => {
      const { container } = renderFan([item('a', { src: null }), item('b'), item('c')]);

      expect(container.querySelectorAll('.novel-card__cover--empty')).toHaveLength(1);
      fireEvent.error(container.querySelector('img[src="/media/b.png"]')!);
      expect(container.querySelectorAll('.novel-card__cover--empty')).toHaveLength(2);
      expect(container.querySelectorAll('img')).toHaveLength(1);
    });
  });

  describe('controls', () => {
    it('browses with previous and next buttons that have tooltips and wrap around', async () => {
      const user = userEvent.setup();
      renderFan();
      const prev = screen.getByRole('button', { name: 'Ảnh trước' });
      const next = screen.getByRole('button', { name: 'Ảnh sau' });
      for (const el of [prev, next]) expect(el.querySelector('svg')).not.toBeNull();
      await expectTooltip(prev, 'Ảnh trước');
      await expectTooltip(next, 'Ảnh sau');

      await user.click(next);
      expect(counter()).toBe('02 / 03');
      await user.click(prev);
      await user.click(prev);
      expect(counter()).toBe('03 / 03');
      await user.click(next);
      expect(counter()).toBe('01 / 03');
    });

    it('takes custom button labels', () => {
      renderFan(ITEMS, { labels: { previous: 'Truyện trước', next: 'Truyện sau' } });

      expect(screen.getByRole('button', { name: 'Truyện trước' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Truyện sau' })).toBeInTheDocument();
    });

    it('can be controlled: shows the given index and reports changes', async () => {
      const seen: number[] = [];
      function Controlled() {
        const [index, setIndex] = useState(1);
        return (
          <FanCarousel
            items={ITEMS}
            index={index}
            onIndexChange={(i) => {
              seen.push(i);
              setIndex(i);
            }}
          />
        );
      }
      render(
        <MemoryRouter>
          <Controlled />
        </MemoryRouter>,
      );
      expect(counter()).toBe('02 / 03');

      await userEvent.setup().click(screen.getByRole('button', { name: 'Ảnh sau' }));

      expect(seen).toEqual([2]);
      expect(counter()).toBe('03 / 03');
    });

    it('has no arrows, counter, pause button or timer for a single item', () => {
      vi.useFakeTimers();
      const { unmount } = renderFan([item('a')]);

      expect(screen.queryByRole('button', { name: 'Ảnh trước' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Ảnh sau' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Tạm dừng' })).not.toBeInTheDocument();
      expect(screen.queryByText(/^\d\d \/ \d\d$/)).not.toBeInTheDocument();
      expect(vi.getTimerCount()).toBe(0);
      unmount();
    });

    it('renders nothing for no items', () => {
      const { container } = renderFan([]);

      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('auto-advance', () => {
    beforeEach(() => vi.useFakeTimers());

    const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

    it('moves on every 6 seconds and wraps around', async () => {
      renderFan();

      await tick(5999);
      expect(counter()).toBe('01 / 03');
      await tick(1);
      expect(counter()).toBe('02 / 03');
      await tick(6000);
      await tick(6000);
      expect(counter()).toBe('01 / 03');
    });

    it('restarts the 6 second timer when previous or next is pressed', async () => {
      renderFan();

      await tick(4000);
      fireEvent.click(screen.getByRole('button', { name: 'Ảnh sau' }));
      expect(counter()).toBe('02 / 03');
      await tick(5999);
      expect(counter()).toBe('02 / 03');
      await tick(1);
      expect(counter()).toBe('03 / 03');
      fireEvent.click(screen.getByRole('button', { name: 'Ảnh trước' }));
      expect(counter()).toBe('02 / 03');
    });

    it('stops with the pause button and resumes with the same button', async () => {
      renderFan();

      fireEvent.click(screen.getByRole('button', { name: 'Tạm dừng' }));
      expect(screen.getByRole('button', { name: 'Tiếp tục' })).toBeInTheDocument();
      await tick(20000);
      expect(counter()).toBe('01 / 03');

      fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
      await tick(6000);
      expect(counter()).toBe('02 / 03');
    });

    it('waits while the pointer is over it or focus is inside it', async () => {
      renderFan([item('a', { onOpen: () => {} }), item('b', { onOpen: () => {} }), item('c', { onOpen: () => {} })]);
      const region = screen.getByRole('region', { name: 'Ảnh nổi bật' });

      fireEvent.mouseEnter(region);
      await tick(12000);
      expect(counter()).toBe('01 / 03');
      fireEvent.mouseLeave(region);
      await tick(6000);
      expect(counter()).toBe('02 / 03');

      act(() => screen.getByRole('button', { name: 'Alt a' }).focus());
      await tick(12000);
      expect(counter()).toBe('02 / 03');
      act(() => screen.getByRole('button', { name: 'Alt a' }).blur());
      await tick(6000);
      expect(counter()).toBe('03 / 03');
    });

    it('waits while the parent holds it', async () => {
      const view = renderFan(ITEMS, { hold: true });
      await tick(12000);
      expect(counter()).toBe('01 / 03');

      view.rerender(
        <MemoryRouter>
          <FanCarousel items={ITEMS} label="Ảnh nổi bật" hold={false} />
        </MemoryRouter>,
      );
      await tick(6000);
      expect(counter()).toBe('02 / 03');
    });

    it('does not advance with prefers-reduced-motion', async () => {
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener() {},
        removeEventListener() {},
      }));
      renderFan();

      await tick(30000);
      expect(counter()).toBe('01 / 03');
      expect(vi.getTimerCount()).toBe(0);
    });

    it('clears its timer on unmount', async () => {
      const view = renderFan();
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      view.unmount();

      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('layout CSS', () => {
    it('centres the fan in its container and the controls below it', () => {
      expect(css).toMatch(/\.fan__item\s*\{[^}]*position:\s*absolute[^}]*left:\s*50%/);
      expect(css).toMatch(/\.fan__item\s*\{[^}]*translate\(-50%,\s*-50%\)/);
      expect(css).toMatch(/\.fan__stage\s*\{[^}]*position:\s*relative/);
      expect(css).toMatch(/\.fan__controls\s*\{[^}]*justify-content:\s*center/);
      expect(css).toMatch(/\.fan\s*\{[^}]*width:\s*100%/);
    });

    it('keeps the mobile layout to the current item only', () => {
      expect(css).toMatch(/@media \(max-width: 760px\)\s*\{[^@]*\.fan__item:not\(\[aria-current='true'\]\)\s*\{[^}]*display:\s*none/);
    });

    it('does not move without motion and uses no gradient or hard-coded colour', () => {
      expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^@]*\.fan__item\s*\{[^}]*transition:\s*none/);
      const own = css.slice(css.indexOf('.fan {'), css.indexOf('.fan__counter'));
      expect(own).not.toMatch(/gradient|#[0-9a-f]{3,6}\b|box-shadow/i);
    });
  });
});
