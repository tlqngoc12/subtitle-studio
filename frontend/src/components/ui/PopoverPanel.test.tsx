import * as Popover from '@radix-ui/react-popover';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PopoverPanel } from './PopoverPanel';

describe('PopoverPanel', () => {
  it('renders in a portal with the shared popover class plus the specific one', () => {
    render(
      <Popover.Root open>
        <Popover.Trigger>open</Popover.Trigger>
        <PopoverPanel className="saveto" aria-label="Panel">
          content
        </PopoverPanel>
      </Popover.Root>,
    );
    const panel = screen.getByRole('dialog', { name: 'Panel' });
    expect(panel).toHaveClass('popover', 'saveto');
    expect(panel).toHaveTextContent('content');
  });
});
