import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useConfirmDialog } from './useConfirmDialog';

function Harness({ onAnswer }: { onAnswer: (ok: boolean) => void }) {
  const { confirm, dialog } = useConfirmDialog();
  return (
    <>
      <button
        type="button"
        onClick={async () =>
          onAnswer(await confirm({ title: 'Delete "Video"?', description: 'It cannot be undone.', confirmLabel: 'Delete', destructive: true }))
        }
      >
        Open
      </button>
      {dialog}
    </>
  );
}

describe('useConfirmDialog', () => {
  it('resolves true when confirmed and shows title, description and a danger button', async () => {
    const answers: boolean[] = [];
    render(<Harness onAnswer={(ok) => answers.push(ok)} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveAccessibleName('Delete "Video"?');
    expect(within(dialog).getByText('It cannot be undone.')).toBeInTheDocument();
    const confirmButton = within(dialog).getByRole('button', { name: 'Delete' });
    expect(confirmButton).toHaveClass('button--danger-solid');
    await user.click(confirmButton);

    await waitFor(() => expect(answers).toEqual([true]));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('resolves false on Cancel and on Escape, focusing Cancel first', async () => {
    const answers: boolean[] = [];
    render(<Harness onAnswer={(ok) => answers.push(ok)} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(answers).toEqual([false]));

    await user.click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(answers).toEqual([false, false]));
  });

  it("shows an alert with only an OK button, focused, and closes on OK or Escape", async () => {
    const answers: boolean[] = [];
    function AlertHarness() {
      const { confirm, dialog } = useConfirmDialog();
      return (
        <>
          <button type="button" onClick={async () => answers.push(await confirm({ title: "Banner is full", description: "Remove one first.", confirmLabel: "OK", alertOnly: true }))}>
            Open
          </button>
          {dialog}
        </>
      );
    }
    render(<AlertHarness />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Open" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(within(dialog).getAllByRole("button")).toHaveLength(1);
    expect(within(dialog).getByRole("button", { name: "OK" })).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "OK" }));
    await waitFor(() => expect(answers).toHaveLength(1));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(answers).toHaveLength(2));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
