import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Page } from './Page';

describe('Page', () => {
  it('renders a main landmark with the default width', () => {
    render(<Page>content</Page>);
    const main = screen.getByRole('main');
    expect(main).toHaveClass('page');
    expect(main).not.toHaveClass('page--wide', 'page--narrow');
  });

  it('adds the width modifier and keeps extra classes', () => {
    render(
      <Page width="wide" className="extra">
        x
      </Page>,
    );
    expect(screen.getByRole('main')).toHaveClass('page', 'page--wide', 'extra');
  });

  it('passes other props to the main element', () => {
    render(<Page data-x="1">x</Page>);
    expect(screen.getByRole('main')).toHaveAttribute('data-x', '1');
  });
});
