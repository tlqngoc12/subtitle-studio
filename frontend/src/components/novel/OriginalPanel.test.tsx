import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { css } from '../../test/css';
import { OriginalPanel } from './OriginalPanel';

const TEXT = 'First.\n\nSecond.\n\nThird.\n\nFourth.';

function stubWidth(wide: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: wide && query.includes('1024px'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe('OriginalPanel on a wide screen', () => {
  it('shows the original as a heading, a labelled region and one <p> per paragraph', () => {
    stubWidth(true);
    render(<OriginalPanel language="en" text={TEXT} activeIndex={null} />);

    expect(screen.getByRole('heading', { name: 'Original (English)' })).toBeInTheDocument();
    const region = screen.getByRole('region', { name: 'Original text' });
    expect(region).toHaveAttribute('lang', 'en');
    expect([...region.querySelectorAll('p')].map((p) => p.textContent)).toEqual(['First.', 'Second.', 'Third.', 'Fourth.']);
    expect(document.querySelector('details')).toBeNull();
  });

  it('labels a Thai original', () => {
    stubWidth(true);
    render(<OriginalPanel language="th" text="สวัสดี" activeIndex={null} />);

    expect(screen.getByRole('heading', { name: 'Original (Thai)' })).toBeInTheDocument();
  });

  it('marks the active paragraph with aria-current and a tint, and no other', () => {
    stubWidth(true);
    render(<OriginalPanel language="en" text={TEXT} activeIndex={2} />);

    const marked = [...document.querySelectorAll('[aria-current="true"]')];
    expect(marked.map((p) => p.textContent)).toEqual(['Third.']);
    expect(marked[0]).toHaveClass('chapter-original__p--active');
    expect(document.querySelectorAll('.chapter-original__p--active')).toHaveLength(1);
  });

  it('scrolls only the active paragraph into view, nearest, and never the page', () => {
    stubWidth(true);
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
    const pageScroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const { rerender } = render(<OriginalPanel language="en" text={TEXT} activeIndex={null} />);
    expect(spy).not.toHaveBeenCalled();

    rerender(<OriginalPanel language="en" text={TEXT} activeIndex={2} />);

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith({ block: 'nearest' });
    expect((spy.mock.contexts[0] as HTMLElement).textContent).toBe('Third.');
    expect(pageScroll).not.toHaveBeenCalled();
  });

  it('does not scroll again while the active paragraph stays the same', () => {
    stubWidth(true);
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
    const { rerender } = render(<OriginalPanel language="en" text={TEXT} activeIndex={1} />);

    rerender(<OriginalPanel language="en" text={TEXT} activeIndex={1} />);

    expect(spy).toHaveBeenCalledOnce();
  });

  it('ignores an index past the last paragraph', () => {
    stubWidth(true);
    render(<OriginalPanel language="en" text={TEXT} activeIndex={9} />);

    expect(document.querySelector('[aria-current]')).toBeNull();
  });

  it('shows the footer under the text', () => {
    stubWidth(true);
    render(<OriginalPanel language="en" text={TEXT} activeIndex={null} footer={<p>Fetched today</p>} />);

    expect(screen.getByText('Fetched today')).toBeInTheDocument();
  });
});

describe('OriginalPanel below 1024 px', () => {
  it('is a disclosure that starts closed', () => {
    stubWidth(false);
    render(<OriginalPanel language="en" text={TEXT} activeIndex={null} />);

    const details = document.querySelector('details')!;
    expect(details).not.toHaveAttribute('open');
    expect(details.querySelector('summary')).toHaveTextContent('Original (English)');
    expect(details.querySelectorAll('p')).toHaveLength(4);
  });
});

describe('OriginalPanel images', () => {
  const WITH_IMAGES = 'Before.\n\n[[image:12]]\n\nAfter.';

  it('shows the image itself where a marker stands, in its own paragraph', () => {
    stubWidth(true);
    render(<OriginalPanel language="en" text={WITH_IMAGES} activeIndex={null} />);

    const region = screen.getByRole('region', { name: 'Original text' });
    const paragraphsShown = [...region.querySelectorAll('p')];
    expect(paragraphsShown).toHaveLength(3);
    const img = paragraphsShown[1].querySelector('img')!;
    expect(img).toHaveAttribute('src', '/api/media/12');
    expect(img).toHaveAttribute('alt', 'Image in the chapter');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveClass('chapter-original__img');
    expect(region).not.toHaveTextContent('[[image:12]]');
  });

  it('highlights the paragraph of an image like any other', () => {
    stubWidth(true);
    render(<OriginalPanel language="en" text={WITH_IMAGES} activeIndex={1} />);

    const marked = document.querySelectorAll('[aria-current="true"]');
    expect(marked).toHaveLength(1);
    expect(marked[0].querySelector('img')).not.toBeNull();
  });

  it('fits the image to the panel width', () => {
    expect(css).toMatch(/\.chapter-original__img\s*\{[^}]*max-width:\s*100%/);
    expect(css).toMatch(/\.chapter-original__img\s*\{[^}]*height:\s*auto/);
  });
});

describe('OriginalPanel styles', () => {
  it('tints the active paragraph with a 38% orchid tint and a left bar (box-shadow, so the text does not shift)', () => {
    expect(css).toMatch(/\.chapter-original__p--active\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--brand-2\) 38%, transparent\)/);
    expect(css).toMatch(/\.chapter-original__p--active\s*\{[^}]*box-shadow:\s*inset 3px 0 0 var\(--brand-2-border\)/);
  });
});

describe('OriginalPanel disclosure summary', () => {
  it('uses the shared chevron summary, like Chapter details', () => {
    stubWidth(false);
    render(<OriginalPanel language="en" text={TEXT} activeIndex={null} />);

    const summary = document.querySelector('details > summary')!;
    expect(summary).toHaveClass('disclosure__summary');
    expect(summary.querySelector('svg.disclosure__chevron')).not.toBeNull();
  });
});
