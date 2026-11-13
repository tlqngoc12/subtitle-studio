import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('renders a visible H1 and the lede in a masthead', () => {
    const { container } = render(<PageHeader title="Vietsub" lede="Pick one" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Vietsub' })).toHaveClass('masthead__name');
    expect(screen.getByText('Pick one')).toHaveClass('masthead__lede');
    expect(container.querySelector('header')).toHaveClass('masthead');
    expect(container.querySelector('header')).not.toHaveClass('masthead--row');
  });

  it('puts the actions beside the text in a row, inside the header', () => {
    const { container } = render(<PageHeader title="Novels" lede="x" actions={<button>New</button>} className="extra" />);
    const header = container.querySelector('header')!;
    expect(header).toHaveClass('masthead', 'masthead--row', 'extra');
    expect(within(header).getByRole('button', { name: 'New' })).toBeInTheDocument();
    expect(within(header).getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('omits the lede when there is none', () => {
    const { container } = render(<PageHeader title="Only" />);
    expect(container.querySelector('.masthead__lede')).toBeNull();
  });

  it('renders the breadcrumbs before the heading', () => {
    render(
      <MemoryRouter>
        <PageHeader title="Chapter 3" breadcrumbs={[{ label: 'Novels', to: '/novels' }, { label: 'Chapter 3' }]} />
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(nav.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('forwards onNavigate to the breadcrumbs', async () => {
    const onNavigate = vi.fn();
    render(
      <MemoryRouter>
        <PageHeader title="Chapter 3" onNavigate={onNavigate} breadcrumbs={[{ label: 'Novels', to: '/novels' }, { label: 'Chapter 3' }]} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('link', { name: 'Novels' }));
    expect(onNavigate).toHaveBeenCalledWith(expect.anything(), '/novels');
  });

  it('hero puts the media before the heading and the meta after it', () => {
    render(
      <PageHeader variant="hero" title="Be My Sugar" media={<img alt="Cover" src="x.webp" />} meta={<span>Published</span>} actions={<button>Edit</button>} />,
    );
    const cover = screen.getByRole('img', { name: 'Cover' });
    const h1 = screen.getByRole('heading', { level: 1, name: 'Be My Sugar' });
    const meta = screen.getByText('Published');
    expect(cover.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(h1.compareDocumentPosition(meta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });
});
