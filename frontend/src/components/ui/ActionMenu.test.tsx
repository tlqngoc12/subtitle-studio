import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Plus } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { expectTooltip } from '../../test/tooltip';
import { ActionMenu } from './ActionMenu';

describe('ActionMenu', () => {
  it('opens from a labelled ⋯ button, runs the chosen action and closes', async () => {
    const onSelect = vi.fn();
    render(<ActionMenu label="Chapter actions" items={[{ label: 'Add chapter', icon: Plus, onSelect }]} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Chapter actions' }));
    await user.click(screen.getByRole('button', { name: 'Add chapter' }));

    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Add chapter' })).not.toBeInTheDocument();
  });

  it('shows why a disabled action cannot run, and does not run it', async () => {
    const onSelect = vi.fn();
    render(<ActionMenu label="Actions" items={[{ label: 'Sync', onSelect, disabledReason: 'Add a link first.' }]} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Actions' }));

    const item = screen.getByRole('button', { name: 'Sync' });
    expect(item).toBeDisabled();
    await expectTooltip(item.parentElement!, 'Add a link first.');
    await user.click(item);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('disables an action without a reason', async () => {
    render(<ActionMenu label="Actions" items={[{ label: 'Export', onSelect: vi.fn(), disabled: true }]} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Actions' }));

    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
  });
});
