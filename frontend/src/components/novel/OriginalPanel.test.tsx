import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
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

vi.mock('sonner', async (orig) => ({
  ...(await orig<typeof import('sonner')>()),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

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

  it('labels a Spanish original', () => {
    stubWidth(true);
    render(<OriginalPanel language="es" text="Hola" activeIndex={null} />);

    expect(screen.getByRole('heading', { name: 'Original (Spanish)' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Original text' })).toHaveAttribute('lang', 'es');
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

describe('OriginalPanel copy button', () => {
  const original = 'One.\n\n[[image:3]]\n\nTwo.';

  it('copies the original without the image markers, and shows a check for 1.5 s', async () => {
    vi.useFakeTimers();
    stubWidth(true);
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    render(<OriginalPanel language="en" text={original} activeIndex={null} />);

    const button = screen.getByRole('button', { name: 'Copy original text' });
    expect(button.querySelector('svg.lucide-copy')).not.toBeNull();
    await act(async () => {
      fireEvent.click(button);
    });

    expect(writeText).toHaveBeenCalledWith('One.\n\nTwo.');
    expect(toast.success).toHaveBeenCalledWith('Copied');
    expect(button.querySelector('svg.lucide-check')).not.toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(1600);
    });
    expect(button.querySelector('svg.lucide-copy')).not.toBeNull();
  });

  it('shows an error toast when the clipboard refuses', async () => {
    stubWidth(true);
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    render(<OriginalPanel language="en" text={original} activeIndex={null} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy original text' }));
    });

    expect(toast.error).toHaveBeenCalledWith('Could not copy');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('copies an empty text as an empty string', async () => {
    stubWidth(true);
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    render(<OriginalPanel language="en" text="" activeIndex={null} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy original text' }));
    });
    expect(writeText).toHaveBeenCalledWith('');
  });

  it('is in the box wrapper, not in the scrolling text, and below 1024 px once the disclosure is open', () => {
    stubWidth(false);
    render(<OriginalPanel language="en" text={original} activeIndex={null} />);

    const button = screen.getByRole('button', { name: 'Copy original text', hidden: true });
    expect(button.parentElement).toHaveClass('chapter-original__box');
    expect(screen.getByRole('region', { name: 'Original text', hidden: true })).not.toContainElement(button);
  });

  it('pins the button to the box corner', () => {
    expect(css).toMatch(/\.chapter-original__box\s*\{[^}]*position:\s*relative/);
    expect(css).toMatch(/\.chapter-original__box > \.copy-corner\s*\{[^}]*position:\s*absolute[^}]*top:[^}]*right:/);
    expect(css).toMatch(/\.chapter-original__text\s*\{[^}]*padding-right:\s*3rem/);
  });
});
