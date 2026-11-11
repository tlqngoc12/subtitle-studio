import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fanfic } from '../../test/fanficFixtures';
import { FanficCard } from './FanficCard';

describe('FanficCard', () => {
  it('shows the cover, title, status, four labelled stats and the description', () => {
    render(<FanficCard fanfic={fanfic()} />);

    const link = screen.getByRole('link', { name: /The Way She Warmed Me/ });
    expect(link).toHaveAttribute('href', 'https://www.wattpad.com/story/396487502');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(within(link).getByText('Complete')).toBeInTheDocument();
    const expected: [string, string][] = [
      ['Reads', '51K'],
      ['Votes', '2.1K'],
      ['Parts', '28'],
      ['Time', '1h 8m'],
    ];
    for (const [label, value] of expected) {
      const stat = within(link).getByText(label).closest('.fanfic-stat') as HTMLElement;
      expect(within(stat).getByText(value)).toBeInTheDocument();
    }
    const description = within(link).getByText(/Emi never expected/);
    expect(description).toHaveClass('fanfic-card__desc');
    expect(link.querySelector('img')).toHaveAttribute('src', '/api/media/9');
  });

  it('says Ongoing for a story that is not finished', () => {
    render(<FanficCard fanfic={fanfic({ completed: false })} />);

    expect(screen.getByText('Ongoing')).toBeInTheDocument();
    expect(screen.queryByText('Complete')).not.toBeInTheDocument();
  });

  it('survives huge and zero numbers without NaN', () => {
    render(
      <FanficCard
        fanfic={fanfic({ readCount: 12345678, voteCount: 0, partCount: 0, wordCount: 0, readingMinutes: 0 })}
      />,
    );

    expect(screen.getByText('12.3M')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('NaN');
  });

  it('shows a placeholder when there is no cover and no description', () => {
    const { container } = render(<FanficCard fanfic={fanfic({ coverUrl: null, description: null })} />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.fanfic-card__desc')).toBeNull();
  });

  it('renders the admin menu outside the link', () => {
    render(<FanficCard fanfic={fanfic()} menu={<button type="button">Menu for story</button>} />);

    const menu = screen.getByRole('button', { name: 'Menu for story' });
    expect(menu.closest('a')).toBeNull();
    expect(screen.getByRole('link').contains(menu)).toBe(false);
  });
});
