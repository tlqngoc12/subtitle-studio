import * as Tabs from '@radix-ui/react-tabs';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { css } from '../../test/css';
import { TabTrigger } from './TabTrigger';

function Demo() {
  return (
    <Tabs.Root defaultValue="a">
      <Tabs.List>
        <TabTrigger className="tabs__tab" value="a">A</TabTrigger>
        <TabTrigger className="tabs__tab" value="b">B</TabTrigger>
      </Tabs.List>
    </Tabs.Root>
  );
}

describe('TabTrigger', () => {
  it('marks a pointer press so the focus ring stays hidden, and clears it on blur', () => {
    render(<Demo />);
    const b = screen.getByRole('tab', { name: 'B' });
    fireEvent.pointerDown(b);
    expect(b).toHaveAttribute('data-pointer');
    fireEvent.blur(b);
    expect(b).not.toHaveAttribute('data-pointer');
  });

  it('does not mark keyboard use, and a key press clears a pointer mark', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    const a = screen.getByRole('tab', { name: 'A' });
    await user.tab();
    expect(a).toHaveFocus();
    expect(a).not.toHaveAttribute('data-pointer');
    fireEvent.pointerDown(a);
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'A' })).not.toHaveAttribute('data-pointer');
  });
});

describe('tab focus ring styles', () => {
  it('hides the ring only for pointer-marked tabs and keeps the global keyboard ring', () => {
    expect(css).toMatch(/\.tabs__tab\[data-pointer\]:focus-visible\s*\{\s*outline:\s*none;/);
    expect(css).toMatch(/^:focus-visible\s*\{\s*outline:\s*3px solid var\(--focus\)/m);
    expect(css).not.toMatch(/\.tabs__tab:focus-visible\s*\{[^}]*outline:\s*none/);
  });
});
