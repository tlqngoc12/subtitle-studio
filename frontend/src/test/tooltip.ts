import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect } from 'vitest';

/** Hovers `el`, checks the tooltip it opens (Radix, role "tooltip"), then closes it with Esc. */
export async function expectTooltip(el: HTMLElement, text: string) {
  const user = userEvent.setup();
  await user.hover(el);
  expect(await screen.findByRole('tooltip')).toHaveTextContent(text);
  // jsdom cannot move the pointer out of Radix's grace area, so close the way keyboard users do.
  await user.keyboard('{Escape}');
  await user.unhover(el);
  await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
}
