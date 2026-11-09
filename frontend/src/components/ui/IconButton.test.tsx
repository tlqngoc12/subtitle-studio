import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Trash2 } from 'lucide-react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { expectTooltip } from '../../test/tooltip';
import { IconButton, IconLink } from './IconButton';

describe('IconButton', () => {
  it('uses the label as accessible name and tooltip, and passes props through', async () => {
    const onClick = vi.fn();
    render(<IconButton label="Delete page" icon={Trash2} className="button--danger" onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Delete page' });
    expect(button).toHaveClass('button', 'button--icon', 'button--danger');
    expect(button).toHaveAttribute('type', 'button');
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    await expectTooltip(button, 'Delete page');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('can be disabled', () => {
    render(<IconButton label="Go" icon={Trash2} disabled />);
    expect(screen.getByRole('button', { name: 'Go' })).toBeDisabled();
  });
});

describe('IconLink', () => {
  it('renders a router link with the same label rules', async () => {
    render(
      <MemoryRouter>
        <IconLink label="Next chapter" icon={Trash2} to="/n/2" />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Next chapter' });
    expect(link).toHaveAttribute('href', '/n/2');
    expect(link).toHaveClass('button', 'button--icon');
    await expectTooltip(link, 'Next chapter');
  });
});
