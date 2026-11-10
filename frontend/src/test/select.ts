import { screen } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

/** Opens the shared Select (a Radix combobox) and clicks the option with this accessible name. */
export async function pickOption(user: UserEvent, trigger: HTMLElement, option: string | RegExp) {
  await user.click(trigger);
  await user.click(await screen.findByRole('option', { name: option }));
}

/** Opens the shared Select and returns the names of its options; closes it again with Escape. */
export async function optionNames(user: UserEvent, trigger: HTMLElement): Promise<string[]> {
  await user.click(trigger);
  const names = (await screen.findAllByRole('option')).map((o) => o.textContent ?? '');
  await user.keyboard('{Escape}');
  return names;
}
