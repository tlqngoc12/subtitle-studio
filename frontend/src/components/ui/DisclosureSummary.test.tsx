import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { css } from '../../test/css';
import { DisclosureSummary } from './DisclosureSummary';

describe('DisclosureSummary', () => {
  it('renders its text after a hidden chevron icon, inside a summary', () => {
    const { container } = render(
      <details>
        <DisclosureSummary>Chapter details</DisclosureSummary>
        <p>body</p>
      </details>,
    );

    const summary = container.querySelector('summary')!;
    expect(summary).toHaveTextContent('Chapter details');
    expect(summary.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(summary).toHaveClass('disclosure__summary');
  });

  it('has a 44 px tap target, no native marker and a chevron that turns 90 degrees when open', () => {
    expect(css).toMatch(/\.disclosure__summary\s*\{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.disclosure__summary\s*\{[^}]*list-style:\s*none/);
    expect(css).toMatch(/details\[open\] > \.disclosure__summary > \.disclosure__chevron\s*\{[^}]*rotate\(90deg\)/);
    expect(css).toMatch(/\.disclosure__chevron\s*\{[^}]*transition:\s*transform var\(--dur-fast\) var\(--ease-out\)/);
  });
});
