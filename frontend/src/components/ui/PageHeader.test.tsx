import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('renders the title and the lede in a masthead', () => {
    const { container } = render(<PageHeader title="Vietsub" lede="Pick one" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Vietsub' })).toHaveClass('masthead__name');
    expect(screen.getByText('Pick one')).toHaveClass('masthead__lede');
    expect(container.querySelector('header')).toHaveClass('masthead');
    expect(container.querySelector('header')).not.toHaveClass('masthead--row');
  });

  it('puts the actions beside the text in a row', () => {
    const { container } = render(<PageHeader title="Novels" lede="x" actions={<button>New</button>} className="extra" />);
    const header = container.querySelector('header')!;
    expect(header).toHaveClass('masthead', 'masthead--row', 'extra');
    expect(header.firstElementChild?.tagName).toBe('DIV');
    expect(screen.getByRole('button', { name: 'New' }).parentElement).toBe(header);
  });

  it('omits the lede when there is none', () => {
    const { container } = render(<PageHeader title="Only" />);
    expect(container.querySelector('.masthead__lede')).toBeNull();
  });
});
