import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect } from 'vitest';

/** Answers the app's confirm dialog (Radix AlertDialog) by clicking `button`, optionally checking its title. */
export async function answerConfirm(button: string, title?: string) {
  const dialog = await screen.findByRole('alertdialog');
  if (title) expect(dialog).toHaveAccessibleName(title);
  await userEvent.setup().click(within(dialog).getByRole('button', { name: button }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
}
