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
  const row = screen.getByRole('region', { name: 'Ảnh banner' }).querySelector('.filmstrip__row') as HTMLElement;
  return {
    onOpen,
    row,
    slide: (name: string) => within(row).getByRole('button', { name }),
  };
}

/** jsdom has no layout: give the row the measurements the arrows read, then let it report a scroll. */
function layout(row: HTMLElement, { scrollLeft, scrollWidth, clientWidth }: { scrollLeft: number; scrollWidth: number; clientWidth: number }) {
  Object.defineProperty(row, 'scrollWidth', {
    configurable: true,
    value: scrollWidth,
  });
  Object.defineProperty(row, 'clientWidth', {
    configurable: true,
    value: clientWidth,
  });
  Object.defineProperty(row, 'scrollLeft', {
    configurable: true,
    writable: true,
    value: scrollLeft,
  });
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
    const { row, slide } = renderStrip();

    expect(within(row).getAllByRole('button')).toHaveLength(3);
    expect(slide('Fan meeting')).toBeInTheDocument();
    expect(slide('Ảnh 2/3')).toBeInTheDocument();
    expect(slide('Backstage')).toBeInTheDocument();
  });

  it('gives each image its description as alt, or alt="" when it has none', () => {
    const { slide } = renderStrip();

    expect(slide('Fan meeting').querySelector('img')).toHaveAttribute('alt', 'Fan meeting');
    expect(slide('Ảnh 2/3').querySelector('img')).toHaveAttribute('alt', '');
  });

  it('calls onOpen with the index of the clicked image', async () => {
    const { onOpen, slide } = renderStrip();

    await userEvent.click(slide('Backstage'));

    expect(onOpen).toHaveBeenCalledWith(2);
  });

  describe('description bar', () => {
    it('exists only for an image with a description', () => {
      const { slide } = renderStrip();

      expect(slide('Fan meeting').querySelector('.filmstrip__bar')).toHaveTextContent('Fan meeting');
      expect(slide('Ảnh 2/3').querySelector('.filmstrip__bar')).toBeNull();
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

    it('scroll the row by exactly one slide, the strip clientWidth', async () => {
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

  it('with one image shows no arrows and no dots', () => {
    const { row } = renderStrip([IMAGES[0]]);
    layout(row, { scrollLeft: 500, scrollWidth: 3000, clientWidth: 1000 });

    expect(screen.queryByRole('button', { name: 'Ảnh trước' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ảnh sau' })).not.toBeInTheDocument();
    expect(document.querySelector('.filmstrip__dots')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  describe('dots', () => {
    const dots = () => within(document.querySelector('.filmstrip__dots') as HTMLElement).getAllByRole('button');

    it('are one button per image, named "Ảnh k/n", outside the image row', () => {
      const { row } = renderStrip();

      expect(dots().map((d) => d.getAttribute('aria-label'))).toEqual(['Ảnh 1/3', 'Ảnh 2/3', 'Ảnh 3/3']);
      expect(row.contains(dots()[0])).toBe(false);
    });

    it('mark the current slide with aria-current, derived from scrollLeft / clientWidth', () => {
      const { row } = renderStrip();
      expect(dots()[0]).toHaveAttribute('aria-current', 'true');

      layout(row, { scrollLeft: 1000, scrollWidth: 3000, clientWidth: 1000 });
      expect(dots().map((d) => d.getAttribute('aria-current'))).toEqual([null, 'true', null]);

      layout(row, { scrollLeft: 1900, scrollWidth: 3000, clientWidth: 1000 });
      expect(dots()[2]).toHaveAttribute('aria-current', 'true');
      expect(document.querySelectorAll('[aria-current="true"]')).toHaveLength(1);
    });

    it('scroll to index * clientWidth when clicked', async () => {
      const { row } = renderStrip();
      const scrollTo = vi.fn();
      row.scrollTo = scrollTo;
      layout(row, { scrollLeft: 0, scrollWidth: 3000, clientWidth: 800 });

      await userEvent.click(dots()[2]);
      expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ left: 1600 }));
      await userEvent.click(dots()[0]);
      expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ left: 0 }));
    });

    it('have a 24px hit area around a smaller visible dot, the current one orchid with an ink ring', () => {
      const dot = rule('.filmstrip__dot');
      expect(dot).toMatch(/width:\s*24px/);
      expect(dot).toMatch(/height:\s*24px/);
      expect(css).toMatch(/\.filmstrip__dot::before\s*\{[^}]*background:\s*var\(--rule\)/);
      const current = css.match(/\.filmstrip__dot\[aria-current='true'\]::before\s*\{([^}]*)\}/)?.[1] ?? '';
      expect(current).toMatch(/background:\s*var\(--brand-2\)/);
      expect(current).toMatch(/border:\s*2px solid var\(--brand-2-ink\)/);
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

    it('is one flex row with no gap or padding, top-aligned, scrolling natively with mandatory snap and no visible scrollbar', () => {
      const row = rule('.filmstrip__row');
      expect(row).toMatch(/display:\s*flex/);
      expect(row).not.toMatch(/flex-wrap:\s*wrap/);
      expect(row).not.toMatch(/gap:|padding/);
      expect(row).toMatch(/align-items:\s*start/);
      expect(row).toMatch(/overflow-x:\s*auto/);
      expect(row).toMatch(/scroll-snap-type:\s*x mandatory/);
      expect(row).toMatch(/scrollbar-width:\s*none/);
      expect(css).toMatch(/\.filmstrip__row::-webkit-scrollbar\s*\{[^}]*display:\s*none/);
      expect(rule('.filmstrip__item')).toMatch(/scroll-snap-align:\s*start/);
      expect(rule('.filmstrip__item')).toMatch(/scroll-snap-stop:\s*always/);
    });

    it('makes every slide 100% of the strip and shows its image whole at 100% width, auto height, no radius', () => {
      const item = rule('.filmstrip__item');
      expect(item).toMatch(/flex:\s*0 0 100%/);
      expect(item).toMatch(/width:\s*100%/);
      expect(item).toMatch(/border-radius:\s*0/);
      expect(item).not.toMatch(/\bheight:/);
      const art = rule('.filmstrip__art');
      expect(art).toMatch(/width:\s*100%/);
      expect(art).toMatch(/height:\s*auto/);
      expect(art).not.toMatch(/object-fit:\s*cover|aspect-ratio|border-radius/);
    });

    it('has no card, border, shadow or gradient', () => {
      const own = css.slice(css.indexOf('.filmstrip {'), css.indexOf('@media (prefers-reduced-motion: reduce) {\n  .filmstrip'));
      expect(own).not.toMatch(/box-shadow|gradient|border:\s*1px/);
      expect(rule('.filmstrip')).not.toMatch(/background/);
    });
  });
});
