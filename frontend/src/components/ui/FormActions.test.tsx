import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormActions } from './FormActions';
import { css } from '../../test/css';

describe('FormActions', () => {
  it('keeps the children order and wraps the start slot', () => {
    const { container } = render(
      <FormActions start={<button type="button">Delete</button>}>
        <button type="button">Cancel</button>
        <button type="submit">Save</button>
      </FormActions>,
    );
    const names = screen.getAllByRole('button').map((b) => b.textContent);
    expect(names).toEqual(['Delete', 'Cancel', 'Save']);
    // The class is the contract with the CSS (Delete pushed to the far left).
    expect(container.querySelector('.form-actions__start')).toContainElement(screen.getByRole('button', { name: 'Delete' }));
    expect(container.firstElementChild).not.toHaveClass('form-actions--sticky');
  });

  it('adds the sticky and tight modifiers', () => {
    const { container } = render(
      <FormActions sticky tight>
        <button>Save</button>
      </FormActions>,
    );
    expect(container.firstElementChild).toHaveClass('form-actions', 'form-actions--sticky', 'form-actions--tight');
  });

  it('sticks to the bottom above the content, and the page gets room for the bar', () => {
    const rule = /\.form-actions--sticky\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/position:\s*sticky/);
    expect(rule).toMatch(/bottom:\s*0/);
    expect(rule).toMatch(/z-index:\s*var\(--z-sticky\)/);
    expect(css).toMatch(/\.page:has\(\.form-actions--sticky\)\s*\{[^}]*padding-bottom/);
  });
});
