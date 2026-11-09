import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Cover } from './Cover';

describe('Cover', () => {
  it('renders a decorative image when there is a source', () => {
    const { container } = render(<Cover src="/c.jpg" lazy />);
    const img = container.querySelector('img')!;
    expect(img).toHaveAttribute('src', '/c.jpg');
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveClass('novel-card__cover');
  });

  it('renders the hidden placeholder with the book icon otherwise', () => {
    const { container } = render(<Cover src={null} className="novel-hero__cover" />);
    const span = container.querySelector('span')!;
    expect(span).toHaveClass('novel-hero__cover', 'novel-card__cover--empty');
    expect(span).toHaveAttribute('aria-hidden', 'true');
    expect(span.querySelector('svg')).not.toBeNull();
  });
});
