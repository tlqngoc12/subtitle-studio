import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { css } from '../../test/css';
import { FilmStrip, type FilmImage } from './FilmStrip';

const IMAGES: FilmImage[] = [
  { key: '1', src: '/media/a.png', description: 'Fan meeting' },
  { key: '2', src: '/media/b.png', description: '' },
  { key: '3', src: '/media/c.png', description: 'Backstage' },
];

function renderStrip(images = IMAGES, onOpen = vi.fn()) {
  render(
    <MemoryRouter>
      <FilmStrip images={images} label="Ảnh banner" onOpen={onOpen} />
    </MemoryRouter>,
  );
  return { onOpen, row: screen.getByRole('region', { name: 'Ảnh banner' }).querySelector('.filmstrip__row') as HTMLElement };
}

/** jsdom has no layout: give the row the measurements the arrows read, then let it report a scroll. */
function layout(row: HTMLElement, { scrollLeft, scrollWidth, clientWidth }: { scrollLeft: number; scrollWidth: number; clientWidth: number }) {
  Object.defineProperty(row, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(row, 'clientWidth', { configurable: true, value: clientWidth });
  Object.defineProperty(row, 'scrollLeft', { configurable: true, writable: true, value: scrollLeft });
  fireEvent.scroll(row);
}

const rule = (selector: string) => {
  const esc = selector.replace(/[.[\]()>:]/g, '\\$&');
  return css.match(new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
};

describe('FilmStrip', () => {
  it('renders nothing without images', () => {
    const { container } = render(<FilmStrip images={[]} label="x" onOpen={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is one row of button items named by their description or "Ảnh k/n"', () => {
    const { row } = renderStrip();

    expect(within(row).getAllByRole('button')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Fan meeting' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ảnh 2/3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Backstage' })).toBeInTheDocument();
  });

  it('gives each image its description as alt, or alt="" when it has none', () => {
    renderStrip();

    expect(screen.getByRole('button', { name: 'Fan meeting' }).querySelector('img')).toHaveAttribute('alt', 'Fan meeting');
    expect(screen.getByRole('button', { name: 'Ảnh 2/3' }).querySelector('img')).toHaveAttribute('alt', '');
  });

  it('calls onOpen with the index of the clicked image', async () => {
    const { onOpen } = renderStrip();

    await userEvent.click(screen.getByRole('button', { name: 'Backstage' }));

    expect(onOpen).toHaveBeenCalledWith(2);
  });

  describe('description bar', () => {
    it('exists only for an image with a description', () => {
      renderStrip();

      expect(screen.getByRole('button', { name: 'Fan meeting' }).querySelector('.filmstrip__bar')).toHaveTextContent('Fan meeting');
      expect(screen.getByRole('button', { name: 'Ảnh 2/3' }).querySelector('.filmstrip__bar')).toBeNull();
    });

    it('is hidden until hover or keyboard focus, then fades in', () => {
      expect(rule('.filmstrip__bar')).toMatch(/opacity:\s*0/);
      expect(rule('.filmstrip__bar')).toMatch(/transition:\s*opacity/);
      expect(css).toMatch(/\.filmstrip__item:hover \.filmstrip__bar[^{]*\{[^}]*opacity:\s*1/);
      expect(css).toMatch(/\.filmstrip__item:focus-visible \.filmstrip__bar[^{]*\{[^}]*opacity:\s*1/);
    });

    it('is solid semi-opaque black with --on-frame text, padded by tokens and clamped to 2 lines', () => {
      const bar = rule('.filmstrip__bar');
      expect(bar).toMatch(/background:\s*rgb\(0 0 0 \/ 0\.65\)/);
      expect(bar).toMatch(/color:\s*var\(--on-frame\)/);
      expect(bar).toMatch(/padding:\s*var\(--space-\d+\)/);
      expect(bar).toMatch(/-webkit-line-clamp:\s*2/);
      expect(bar).not.toMatch(/gradient/);
    });

    it('does not animate with reduced motion', () => {
      expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^@]*\.filmstrip__bar\s*\{[^}]*transition:\s*none/);
    });
  });

  describe('arrows', () => {
    it('are hidden when everything fits', () => {
      renderStrip();

      expect(screen.queryByRole('button', { name: 'Ảnh trước' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Ảnh sau' })).not.toBeInTheDocument();
    });

    it('show only "Ảnh sau" at the start and only "Ảnh trước" at the end', () => {
      const { row } = renderStrip();

      layout(row, { scrollLeft: 0, scrollWidth: 3000, clientWidth: 1000 });
      expect(screen.queryByRole('button', { name: 'Ảnh trước' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Ảnh sau' })).toBeInTheDocument();

      layout(row, { scrollLeft: 1000, scrollWidth: 3000, clientWidth: 1000 });
      expect(screen.getByRole('button', { name: 'Ảnh trước' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Ảnh sau' })).toBeInTheDocument();

      layout(row, { scrollLeft: 2000, scrollWidth: 3000, clientWidth: 1000 });
      expect(screen.getByRole('button', { name: 'Ảnh trước' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Ảnh sau' })).not.toBeInTheDocument();
    });

    it('scroll the row by about one viewport of the strip', async () => {
      const { row } = renderStrip();
      const scrollBy = vi.fn();
      row.scrollBy = scrollBy;
      layout(row, { scrollLeft: 1000, scrollWidth: 3000, clientWidth: 900 });

      await userEvent.click(screen.getByRole('button', { name: 'Ảnh sau' }));
      expect(scrollBy).toHaveBeenLastCalledWith(expect.objectContaining({ left: 900 }));
      await userEvent.click(screen.getByRole('button', { name: 'Ảnh trước' }));
      expect(scrollBy).toHaveBeenLastCalledWith(expect.objectContaining({ left: -900 }));
    });

    it('show on hover or focus of the strip, on hover devices only, and sit at the edges centred vertically', () => {
      expect(rule('.filmstrip__arrow')).toMatch(/display:\s*none/);
      expect(css).toMatch(/@media \(hover: hover\)\s*\{[^@]*\.filmstrip:hover \.filmstrip__arrow[^{]*\{[^}]*display:\s*(grid|flex|inline-flex)/);
      expect(css).toMatch(/\.filmstrip:focus-within \.filmstrip__arrow/);
      expect(rule('.filmstrip__arrow')).toMatch(/top:\s*50%/);
      expect(rule('.filmstrip__arrow--prev')).toMatch(/left:/);
      expect(rule('.filmstrip__arrow--next')).toMatch(/right:/);
    });
  });

  it('has no auto-advance, counter or pause button', () => {
    renderStrip();

    expect(screen.queryByRole('button', { name: /Tạm dừng|Tiếp tục/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+ \/ \d+/)).not.toBeInTheDocument();
  });

  describe('style', () => {
    it('breaks out of the page to the full viewport width without adding a horizontal scrollbar', () => {
      const strip = rule('.filmstrip');
      expect(strip).toMatch(/width:\s*100vw/);
      expect(strip).toMatch(/margin-inline:\s*calc\(50% - 50vw\)/);
      expect(css).toMatch(/body:has\(\.filmstrip\)\s*\{[^}]*overflow-x:\s*clip/);
    });

    it('is one flex row with the gap and page gutter, scrolling natively with mandatory snap and no visible scrollbar', () => {
      const row = rule('.filmstrip__row');
      expect(row).toMatch(/display:\s*flex/);
      expect(row).not.toMatch(/flex-wrap:\s*wrap/);
      expect(row).toMatch(/gap:\s*var\(--space-3\)/);
      expect(row).toMatch(/padding-inline:\s*var\(--gutter\)/);
      expect(row).toMatch(/scroll-padding-inline:\s*var\(--gutter\)/);
      expect(row).toMatch(/overflow-x:\s*auto/);
      expect(row).toMatch(/scroll-snap-type:\s*x mandatory/);
      expect(row).toMatch(/scrollbar-width:\s*none/);
      expect(css).toMatch(/\.filmstrip__row::-webkit-scrollbar\s*\{[^}]*display:\s*none/);
      expect(rule('.filmstrip__item')).toMatch(/scroll-snap-align:\s*start/);
    });

    it('gives every image the same clamped height and its natural width, uncropped', () => {
      const item = rule('.filmstrip__item');
      expect(item).toMatch(/height:\s*clamp\(120px,\s*18vw,\s*220px\)/);
      expect(item).toMatch(/flex:\s*none/);
      const art = rule('.filmstrip__art');
      expect(art).toMatch(/height:\s*100%/);
      expect(art).toMatch(/width:\s*auto/);
      expect(art).toMatch(/border-radius:\s*var\(--radius-control\)/);
      expect(art).not.toMatch(/object-fit:\s*cover|aspect-ratio/);
    });

    it('has no card, border, shadow or gradient', () => {
      const own = css.slice(css.indexOf('.filmstrip {'), css.indexOf('@media (prefers-reduced-motion: reduce) {\n  .filmstrip'));
      expect(own).not.toMatch(/box-shadow|gradient|border:\s*1px/);
      expect(rule('.filmstrip')).not.toMatch(/background/);
    });
  });
});
