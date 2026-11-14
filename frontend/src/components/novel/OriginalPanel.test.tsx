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

describe('OriginalPanel styles', () => {
  it('tints the active paragraph with the hover colour', () => {
    expect(css).toMatch(/\.chapter-original__p--active\s*\{[^}]*background:\s*var\(--hover\)/);
  });
});
