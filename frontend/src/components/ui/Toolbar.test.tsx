import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Toolbar } from './Toolbar';

describe('Toolbar', () => {
  it('renders search, filters and actions in that order', () => {
    render(<Toolbar actions={<button>Add</button>} filters={<button>Pills</button>} search={<input aria-label="Search" />} />);
    const items = [
      screen.getByRole('textbox', { name: 'Search' }),
      screen.getByRole('button', { name: 'Pills' }),
      screen.getByRole('button', { name: 'Add' }),
    ];
    for (let i = 0; i < items.length - 1; i++) {
      expect(items[i].compareDocumentPosition(items[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('renders nothing for empty slots', () => {
    const { container } = render(<Toolbar search={<input aria-label="Search" />} />);
    expect(container.querySelector('.toolbar__filters')).toBeNull();
    expect(container.querySelector('.toolbar__actions')).toBeNull();
  });
});
