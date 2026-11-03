import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { block, item } from '../../test/profileFixtures';
import { BlockView } from './BlockView';

describe('BlockView', () => {
  it('renders Markdown text with the block title as a heading', () => {
    render(<BlockView block={block({ id: 1, type: 'TEXT', title: 'Tiểu sử', body: 'Emi là **diễn viên**.' })} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Tiểu sử' })).toBeInTheDocument();
    expect(screen.getByText('diễn viên').tagName).toBe('STRONG');
  });

  it('opens Markdown links in a new tab', () => {
    render(<BlockView block={block({ id: 1, type: 'TEXT', body: '[GMMTV](https://www.gmm-tv.com)' })} />);

    const link = screen.getByRole('link', { name: 'GMMTV' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('markdownIsNotExecuted', () => {
    const { container } = render(
      <BlockView
        block={block({
          id: 1,
          type: 'TEXT',
          body: '<script>alert(1)</script><img src=x onerror=alert(1)>\n\n[x](javascript:alert(1))',
        })}
      />,
    );

    expect(container.querySelector('script, img')).toBeNull();
    const href = screen.getByText('x').closest('a')?.getAttribute('href') ?? '';
    expect(href.toLowerCase().startsWith('javascript:')).toBe(false);
  });

  it('shows an image with its caption', () => {
    render(
      <BlockView block={block({ id: 1, type: 'IMAGE', mediaId: 5, mediaUrl: '/api/media/5', caption: 'Fan meeting' })} />,
    );

    expect(screen.getByRole('img', { name: 'Fan meeting' })).toHaveAttribute('src', '/api/media/5');
    expect(screen.getByText('Fan meeting', { selector: 'figcaption' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View larger: Fan meeting' })).toBeInTheDocument();
  });

  it('shows a gallery as image buttons', () => {
    render(
      <BlockView
        block={block({
          id: 1,
          type: 'GALLERY',
          items: [
            item({ label: 'Image 1', mediaId: 5, mediaUrl: '/api/media/5' }),
            item({ mediaId: 6, mediaUrl: '/api/media/6' }),
          ],
        })}
      />,
    );

    expect(screen.getByRole('button', { name: 'View larger: Image 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View larger: Image 2' })).toBeInTheDocument();
  });

  it('embeds YouTube in a titled iframe', () => {
    const url = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';
    render(<BlockView block={block({ id: 1, type: 'EMBED', embedUrl: url })} />);

    expect(screen.getByTitle('YouTube video')).toHaveAttribute('src', url);
  });

  it.each([
    ['track', '152'],
    ['album', '352'],
  ])('sizes a Spotify %s player', (kind, height) => {
    const url = `https://open.spotify.com/embed/${kind}/4uLU6hMCjMI75M1A2tKUQC`;
    render(<BlockView block={block({ id: 1, type: 'EMBED', embedUrl: url })} />);

    const frame = screen.getByTitle('Spotify');
    expect(frame).toHaveAttribute('src', url);
    expect(frame).toHaveAttribute('height', height);
  });

  it('lists links that open in a new tab', () => {
    render(
      <BlockView
        block={block({ id: 1, type: 'LINKS', items: [item({ label: 'Instagram', value: 'https://instagram.com/x' })] })}
      />,
    );

    const link = screen.getByRole('link', { name: /Instagram/ });
    expect(link).toHaveAttribute('href', 'https://instagram.com/x');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('shows facts as a table', () => {
    render(
      <BlockView block={block({ id: 1, type: 'FACTS', items: [item({ label: 'Ngày sinh', value: '13/05/1999' })] })} />,
    );

    expect(screen.getByRole('rowheader', { name: 'Ngày sinh' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '13/05/1999' })).toBeInTheDocument();
  });
});
