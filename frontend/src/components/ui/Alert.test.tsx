import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Alert } from './Alert';

describe('Alert', () => {
  it('announces the title and the hint', () => {
    render(<Alert title="Could not load" hint="Try again" />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('alert');
    expect(alert.querySelector('.alert__title')).toHaveTextContent('Could not load');
    expect(alert.querySelector('.alert__hint')).toHaveTextContent('Try again');
  });

  it('omits the hint when there is none and keeps extra children and classes', () => {
    render(
      <Alert title="Oops" className="saveto__alert">
        <a href="/x">Back</a>
      </Alert>,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('alert', 'saveto__alert');
    expect(alert.querySelector('.alert__hint')).toBeNull();
    expect(screen.getByRole('link', { name: 'Back' })).toBeInTheDocument();
  });
});
