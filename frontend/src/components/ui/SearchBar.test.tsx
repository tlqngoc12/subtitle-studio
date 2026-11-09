import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SearchBar } from './SearchBar';

describe('SearchBar', () => {
  it('reports typing and shows the clear button only with text', async () => {
    const onChange = vi.fn();
    const onClear = vi.fn();
    const { rerender } = render(<SearchBar value="" onChange={onChange} label="Search videos" onClear={onClear} />);
    const input = screen.getByRole('searchbox', { name: 'Search videos' });
    expect(input).toHaveAttribute('placeholder', 'Search videos');
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
    await userEvent.type(input, 'a');
    expect(onChange).toHaveBeenCalledWith('a');

    rerender(<SearchBar value="abc" onChange={onChange} label="Search videos" onClear={onClear} />);
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});
