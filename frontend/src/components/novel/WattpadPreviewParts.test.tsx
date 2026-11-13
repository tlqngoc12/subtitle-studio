import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { WattpadPreviewPart } from '../../api/novels';
import { WattpadPreviewParts } from './WattpadPreviewParts';

const parts: WattpadPreviewPart[] = [
  { partId: '1', title: 'PROLOGUE', wordCount: 190, modifiedAt: '2025-06-21T09:32:42Z', deleted: false },
  { partId: '2', title: 'Chapter 1: Cold Brew', wordCount: 1951, modifiedAt: null, deleted: false },
  { partId: '3', title: 'Removed one', wordCount: 0, modifiedAt: null, deleted: true },
];

describe('WattpadPreviewParts', () => {
  it('lists the parts read-only', () => {
    render(<WattpadPreviewParts parts={parts} />);

    expect(screen.getByRole('heading', { name: 'Chapters on Wattpad (3)' })).toBeInTheDocument();
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('1,951 words')).toBeInTheDocument();
    expect(screen.getByText('21/06/2025')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText(/fetch and translate chapters one by one in the Wattpad tab/)).toBeInTheDocument();
  });

  it('marks deleted parts', () => {
    render(<WattpadPreviewParts parts={parts} />);

    expect(within(screen.getByText('Removed one').closest('li') as HTMLElement).getByText('Deleted')).toBeInTheDocument();
  });

  it('says so when Wattpad lists no parts', () => {
    render(<WattpadPreviewParts parts={[]} />);

    expect(screen.getByText('Wattpad lists no parts for this story.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Chapters on Wattpad (0)' })).toBeInTheDocument();
  });
});
