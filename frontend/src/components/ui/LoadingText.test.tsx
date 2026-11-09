import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoadingText } from './LoadingText';

describe('LoadingText', () => {
  it('renders muted status text', () => {
    render(<LoadingText>Loading list…</LoadingText>);
    const el = screen.getByRole('status');
    expect(el).toHaveTextContent('Loading list…');
    expect(el).toHaveClass('muted');
  });
});
