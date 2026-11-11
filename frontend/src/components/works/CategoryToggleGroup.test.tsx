import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { WorkCategory } from '../../api/works';
import { CategoryToggleGroup } from './CategoryToggleGroup';

function Harness({ initial, onChange }: { initial: WorkCategory[]; onChange?: (v: WorkCategory[]) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <CategoryToggleGroup
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

describe('CategoryToggleGroup', () => {
  it('shows every category as a toggle button with aria-pressed', () => {
    render(<Harness initial={['MUSIC']} />);
    expect(screen.getAllByRole('button')).toHaveLength(8);
    expect(screen.getByRole('button', { name: 'Music' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Film & TV' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('adds a category after the others and removes one again', async () => {
    const onChange = vi.fn();
    render(<Harness initial={['MUSIC']} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Film & TV' }));
    expect(onChange).toHaveBeenLastCalledWith(['MUSIC', 'FILM_TV']);
    await userEvent.click(screen.getByRole('button', { name: 'Music' }));
    expect(onChange).toHaveBeenLastCalledWith(['FILM_TV']);
  });

  it('cannot remove the last category and says why', async () => {
    const onChange = vi.fn();
    render(<Harness initial={['MUSIC']} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Music' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Choose at least one category.');
    await userEvent.click(screen.getByRole('button', { name: 'Fashion' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a server error', () => {
    render(<CategoryToggleGroup value={['MUSIC']} onChange={() => {}} error="Each category can be chosen only once" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Each category can be chosen only once');
  });
});
