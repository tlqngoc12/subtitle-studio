import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { css } from '../../test/css';
import { photo } from '../../test/photoFixtures';
import { PhotoTile } from './PhotoTile';

describe('PhotoTile', () => {
  it('opens the post and shows the Instagram logo next to the source chip', () => {
    const { container } = render(<PhotoTile post={photo(1, { title: 'Fan meeting' })} />);

    const tile = screen.getByRole('link', { name: 'Fan meeting' });
    expect(tile).toHaveAttribute('href', 'https://www.instagram.com/p/POST1/');
    expect(tile).toHaveAttribute('target', '_blank');
    expect(container.querySelector('svg[data-platform="instagram"]')).not.toBeNull();
    expect(container.querySelector('svg[data-platform="x"]')).toBeNull();
  });

  it('shows the X logo for an X post', () => {
    const { container } = render(<PhotoTile post={photo(2, { postUrl: 'https://x.com/emi/status/123' })} />);

    expect(container.querySelector('svg[data-platform="x"]')).not.toBeNull();
    expect(container.querySelector('svg[data-platform="instagram"]')).toBeNull();
  });

  it('keeps the line breaks of the title', () => {
    render(<PhotoTile post={photo(3, { title: 'Line one\nLine two' })} />);

    expect(screen.getByRole('link').textContent).toContain('Line one\nLine two');
  });

  it('styles the title to keep line breaks and clamp to 3 lines', () => {
    const rule = /\.photo-tile__title\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/white-space:\s*pre-line/);
    expect(rule).toMatch(/line-clamp:\s*3/);
    expect(rule).toMatch(/-webkit-line-clamp:\s*3/);
  });
});
