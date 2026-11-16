import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scrollMatchIntoView } from '../../lib/scrollToMatch';
import { FindReplace } from './FindReplace';

vi.mock('../../lib/scrollToMatch', () => ({ scrollMatchIntoView: vi.fn() }));

vi.mock('sonner', async (orig) => ({
  ...(await orig<typeof import('sonner')>()),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

function Harness({
  initial,
  onClose,
  onOuterSubmit,
  onTextChange,
  onMatchesChange,
}: {
  initial: string;
  onClose?: () => void;
  onOuterSubmit?: () => void;
  onTextChange?: (text: string) => void;
  onMatchesChange?: (matches: { start: number; end: number }[], current: number | null) => void;
}) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onOuterSubmit?.();
      }}
    >
      <textarea ref={ref} aria-label="Chapter text" value={text} onChange={(e) => setText(e.target.value)} />
      <FindReplace
        text={text}
        onChange={(t) => {
          onTextChange?.(t);
          setText(t);
        }} textareaRef={ref} onClose={onClose ?? (() => {})} onMatchesChange={onMatchesChange} />
    </form>
  );
}

const box = () => screen.getByLabelText('Chapter text') as HTMLTextAreaElement;
const find = () => screen.getByLabelText('Find');
const counter = () => screen.getByText(/ of \d+$/);
const button = (name: string) => screen.getByRole('button', { name });
const selected = () => box().value.slice(box().selectionStart, box().selectionEnd);

beforeEach(() => {
  vi.mocked(toast.success).mockClear();
  vi.mocked(scrollMatchIntoView).mockClear();
});

describe('FindReplace counter and navigation', () => {
  it('reads "0 of 0" with the buttons disabled for an empty query', () => {
    render(<Harness initial="Mai gặp Nam." />);

    expect(counter()).toHaveTextContent('0 of 0');
    for (const name of ['Previous match', 'Next match', 'Replace', 'Replace all']) expect(button(name)).toBeDisabled();
  });

  it('reads "0 of 0" for a query that is not found, without crashing', async () => {
    render(<Harness initial="Mai gặp Nam." />);

    await userEvent.setup().type(find(), 'zzz');

    expect(counter()).toHaveTextContent('0 of 0');
    expect(button('Next match')).toBeDisabled();
    expect(button('Replace all')).toBeDisabled();
  });

  it('counts the matches and selects them in the textarea with Next and Previous', async () => {
    const user = userEvent.setup();
    render(<Harness initial="Mai gặp Nam. Mai cười. Nam hỏi Mai." />);

    await user.type(find(), 'Mai');
    expect(counter()).toHaveTextContent('1 of 3');

    await user.click(button('Next match'));
    expect(selected()).toBe('Mai');
    expect(box().selectionStart).toBe(0);
    expect(counter()).toHaveTextContent('1 of 3');

    await user.click(button('Next match'));
    expect(box().selectionStart).toBe(box().value.indexOf('Mai', 1));
    expect(counter()).toHaveTextContent('2 of 3');

    await user.click(button('Next match'));
    await user.click(button('Next match')); // wraps to the first
    expect(box().selectionStart).toBe(0);
    expect(counter()).toHaveTextContent('1 of 3');

    await user.click(button('Previous match')); // wraps to the last
    expect(box().selectionStart).toBe(box().value.lastIndexOf('Mai'));
    expect(counter()).toHaveTextContent('3 of 3');
  });

  it('Enter in the Find field goes to the next match and does not submit an outer form', async () => {
    const onOuterSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial="a b a" onOuterSubmit={onOuterSubmit} />);

    await user.type(find(), 'a{Enter}');

    expect(selected()).toBe('a');
    expect(onOuterSubmit).not.toHaveBeenCalled();
  });

  it('Previous and Next are icon buttons with tooltips', () => {
    render(<Harness initial="abc" />);

    expect(screen.getByRole('button', { name: 'Previous match' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next match' })).toBeInTheDocument();
  });

  it('selecting a match scrolls it into view', async () => {
    const user = userEvent.setup();
    render(<Harness initial="Mai gặp Nam. Mai cười." />);
    await user.type(find(), 'Mai');

    await user.click(button('Next match'));

    expect(scrollMatchIntoView).toHaveBeenCalledWith(box(), 0, expect.any(Number));
  });

  it('Enter in Find never edits the text and keeps the focus in Find', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial="Mai gặp Nam. Mai cười. Nam hỏi Mai. Mai đi." onTextChange={onChange} />);
    await user.type(find(), 'Mai');

    await user.keyboard('{Enter}{Enter}{Enter}');

    expect(onChange).not.toHaveBeenCalled();
    expect(find()).toHaveFocus();
    expect(counter()).toHaveTextContent('3 of 4');
    expect(box().value).toBe('Mai gặp Nam. Mai cười. Nam hỏi Mai. Mai đi.');
  });

  it('Escape after Next puts the focus in the textarea with the match still selected', async () => {
    const user = userEvent.setup();
    render(<Harness initial="Mai gặp Nam. Mai cười." />);
    await user.type(find(), 'Mai');
    await user.click(button('Next match'));
    await user.click(button('Next match'));
    const start = box().value.indexOf('Mai', 1);

    await user.keyboard('{Escape}');

    expect(box()).toHaveFocus();
    expect([box().selectionStart, box().selectionEnd]).toEqual([start, start + 3]);
  });

  it('reports the matches and the current one to onMatchesChange, and clears them on unmount', async () => {
    const onMatchesChange = vi.fn();
    const user = userEvent.setup();
    const { unmount } = render(<Harness initial="Mai gặp Nam. Mai cười." onMatchesChange={onMatchesChange} />);
    await user.type(find(), 'Mai');
    expect(onMatchesChange).toHaveBeenLastCalledWith([{ start: 0, end: 3 }, { start: 13, end: 16 }], 0);

    await user.click(button('Next match'));
    await user.click(button('Next match'));
    expect(onMatchesChange).toHaveBeenLastCalledWith([{ start: 0, end: 3 }, { start: 13, end: 16 }], 1);

    unmount();
    expect(onMatchesChange).toHaveBeenLastCalledWith([], null);
  });

  it('Match case narrows the matches', async () => {
    const user = userEvent.setup();
    render(<Harness initial="Mai mai MAI" />);

    await user.type(find(), 'mai');
    expect(counter()).toHaveTextContent('1 of 3');

    await user.click(screen.getByLabelText('Match case'));
    expect(counter()).toHaveTextContent('1 of 1');
  });
});

describe('FindReplace replacing', () => {
  it('Replace replaces the selected match and moves on to the next', async () => {
    const user = userEvent.setup();
    render(<Harness initial="Nam, Nam, Nam" />);
    await user.type(find(), 'Nam');
    await user.type(screen.getByLabelText('Replace with'), 'Khoa');

    await user.click(button('Next match')); // selects the first
    await user.click(button('Replace'));

    expect(box().value).toBe('Khoa, Nam, Nam');
    expect(selected()).toBe('Nam');
    expect(box().selectionStart).toBe(6);
    expect(counter()).toHaveTextContent('1 of 2');
  });

  it('Enter in Replace with replaces the selected match', async () => {
    const user = userEvent.setup();
    render(<Harness initial="Nam, Nam" />);
    await user.type(find(), 'Nam{Enter}'); // selects the first

    await user.type(screen.getByLabelText('Replace with'), 'Khoa{Enter}');

    expect(box().value).toBe('Khoa, Nam');
  });

  it('Replace with nothing selected selects the first match instead of replacing blindly', async () => {
    const user = userEvent.setup();
    render(<Harness initial="Nam, Nam" />);
    await user.type(find(), 'Nam');
    await user.type(screen.getByLabelText('Replace with'), 'Khoa');

    await user.click(button('Replace'));

    expect(box().value).toBe('Nam, Nam');
    expect(selected()).toBe('Nam');
  });

  it('Replace all replaces every match, toasts the count and Undo restores the text', async () => {
    const user = userEvent.setup();
    render(<Harness initial="Nam, Nam, Nam" />);
    await user.type(find(), 'Nam');
    await user.type(screen.getByLabelText('Replace with'), 'Khoa');

    await user.click(button('Replace all'));

    expect(box().value).toBe('Khoa, Khoa, Khoa');
    expect(toast.success).toHaveBeenCalledWith('Replaced 3', expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) }));

    const action = vi.mocked(toast.success).mock.calls[0][1]!.action as unknown as { onClick: () => void };
    action.onClick();
    expect(await screen.findByDisplayValue('Nam, Nam, Nam')).toBeInTheDocument();
  });

  it('Replace all can delete the matches with an empty replacement', async () => {
    const user = userEvent.setup();
    render(<Harness initial="a-b-c" />);
    await user.type(find(), '-');

    await user.click(button('Replace all'));

    expect(box().value).toBe('abc');
  });

  it('keeps the case of the text it does not replace and respects Match case', async () => {
    const user = userEvent.setup();
    render(<Harness initial="Mai mai MAI" />);
    await user.click(screen.getByLabelText('Match case'));
    await user.type(find(), 'mai');
    await user.type(screen.getByLabelText('Replace with'), 'X');

    await user.click(button('Replace all'));

    expect(box().value).toBe('Mai X MAI');
    expect(toast.success).toHaveBeenCalledWith('Replaced 1', expect.anything());
  });
});

describe('FindReplace closing', () => {
  it('Esc closes the panel and puts the focus back in the textarea', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial="abc" onClose={onClose} />);
    await user.click(find());

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledOnce();
    expect(box()).toHaveFocus();
  });

  it('does not submit an outer form from anywhere in the panel', async () => {
    const onOuterSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial="abc" onOuterSubmit={onOuterSubmit} />);

    await user.type(screen.getByLabelText('Replace with'), 'x{Enter}');
    await user.type(find(), 'a{Enter}');
    await user.click(screen.getByRole('checkbox', { name: 'Match case' }));
    await user.click(button('Next match'));

    expect(onOuterSubmit).not.toHaveBeenCalled();
  });
});
