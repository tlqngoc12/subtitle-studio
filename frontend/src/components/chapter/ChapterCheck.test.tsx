import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fakeFetch, problem, type Route } from '../../test/fakeFetch';
import { chapterDetail } from '../../test/novelFixtures';
import { ChapterTextEditor } from './ChapterTextEditor';

const PROFILE = [
  '## Xưng hô',
  '- "ignored here" → "x"',
  '',
  '## Kiểm tra',
  '- "mẹ cô" → "mẹ em" | "mẹ chị" (Bonnie dùng "em")'.replace('"em")', 'em)'),
  '- "chàng" → (tránh dùng)',
  '- dòng hỏng không có mũi tên',
  '',
].join('\n');

const profile = (text = PROFILE): Route => ({
  method: 'GET',
  path: '/api/novels/3/profile',
  status: 200,
  body: { name: 'P', text, sha: 's', stats: { chapters: 0, edits: 0, otherNovels: [] }, geminiConfigured: true },
});
const noProfile: Route = { method: 'GET', path: '/api/novels/3/profile', status: 404, body: problem(404, 'NO_PROFILE', 'none') };

const TEXT = 'Mẹ cô cười.\n\nChàng đến, và mẹ cô khóc.';

function Harness({ initial = TEXT, locked = false, onText }: { initial?: string; locked?: boolean; onText?: (t: string) => void }) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <ChapterTextEditor
      chapter={chapterDetail()}
      idBase="c"
      showOriginal={false}
      text={text}
      onTextChange={(t) => {
        setText(t);
        onText?.(t);
      }}
      textRef={ref}
      locked={locked}
      hits={{ matches: [], current: null }}
      finding={false}
    />
  );
}

async function checkOn(user: ReturnType<typeof userEvent.setup>) {
  const toggle = await screen.findByRole('button', { name: 'Check' });
  await waitFor(() => expect(toggle).not.toHaveAttribute('aria-disabled'));
  await user.click(toggle);
  await screen.findByRole('button', { name: /^Check · \d+$/ });
}

function caretAt(index: number) {
  const area = screen.getByLabelText('Chapter text') as HTMLTextAreaElement;
  area.focus();
  area.setSelectionRange(index, index);
  fireEvent.click(area);
}

describe('Chapter Check', () => {
  it('toggleShowsCount', async () => {
    const user = userEvent.setup();
    fakeFetch([profile()]);
    render(<Harness />);

    await checkOn(user);

    expect(await screen.findByRole('button', { name: 'Check · 3' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Check · 3' }));
    expect(screen.getByRole('button', { name: 'Check' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('disabledWithoutRules', async () => {
    fakeFetch([profile('## Kiểm tra\n- (Thêm dòng dạng "a" → "b".)\n')]);
    render(<Harness />);

    const toggle = await screen.findByRole('button', { name: 'Check' });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-disabled', 'true'));
    await userEvent.setup().click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('is disabled with a reason when the novel has no profile', async () => {
    fakeFetch([noProfile]);
    render(<Harness />);

    const toggle = await screen.findByRole('button', { name: 'Check' });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-disabled', 'true'));
    const user = userEvent.setup();
    await user.hover(toggle);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('This novel has no profile');
  });

  it('disabledWhileLocked', async () => {
    fakeFetch([profile()]);
    render(<Harness locked />);

    const toggle = await screen.findByRole('button', { name: 'Check' });
    expect(toggle).toHaveAttribute('aria-disabled', 'true');
  });

  it('caretInIssueOpensPopover: shows the reason and a chip per suggestion', async () => {
    const user = userEvent.setup();
    fakeFetch([profile()]);
    render(<Harness />);
    await checkOn(user);
    await screen.findByRole('button', { name: 'Check · 3' });

    caretAt(2);

    const dialog = await screen.findByRole('dialog', { name: 'Check suggestion' });
    expect(dialog).toHaveTextContent('Bonnie dùng em');
    expect(screen.getByRole('button', { name: 'Mẹ em' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mẹ chị' })).toBeInTheDocument();

    caretAt(TEXT.indexOf('đến') + 1);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Check suggestion' })).not.toBeInTheDocument());
  });

  it('singleClickDoesNotApply', async () => {
    const user = userEvent.setup();
    fakeFetch([profile()]);
    const seen = vi.fn();
    render(<Harness onText={seen} />);
    await checkOn(user);
    await screen.findByRole('button', { name: 'Check · 3' });
    caretAt(2);

    await user.click(await screen.findByRole('button', { name: 'Mẹ em' }));

    expect(seen).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Chapter text')).toHaveValue(TEXT);
  });

  it('doubleClickChipApplies, keeping the capital letter, and the count drops', async () => {
    const user = userEvent.setup();
    fakeFetch([profile()]);
    render(<Harness />);
    await checkOn(user);
    await screen.findByRole('button', { name: 'Check · 3' });
    caretAt(2);

    await user.dblClick(await screen.findByRole('button', { name: 'Mẹ em' }));

    await waitFor(() => expect(screen.getByLabelText('Chapter text')).toHaveValue('Mẹ em cười.\n\nChàng đến, và mẹ cô khóc.'));
    expect(await screen.findByRole('button', { name: 'Check · 2' })).toBeInTheDocument();
  });

  it('enterOnChipApplies', async () => {
    const user = userEvent.setup();
    fakeFetch([profile()]);
    render(<Harness />);
    await checkOn(user);
    await screen.findByRole('button', { name: 'Check · 3' });
    caretAt(TEXT.lastIndexOf('mẹ cô') + 1);

    const chip = await screen.findByRole('button', { name: 'mẹ chị' });
    chip.focus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(screen.getByLabelText('Chapter text')).toHaveValue('Mẹ cô cười.\n\nChàng đến, và mẹ chị khóc.'));
  });

  it('escCloses', async () => {
    const user = userEvent.setup();
    fakeFetch([profile()]);
    render(<Harness />);
    await checkOn(user);
    await screen.findByRole('button', { name: 'Check · 3' });
    caretAt(2);
    await screen.findByRole('dialog', { name: 'Check suggestion' });

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Check suggestion' })).not.toBeInTheDocument());
    expect(screen.getByLabelText('Chapter text')).toHaveValue(TEXT);
  });

  it('nextPrevMovesCaret', async () => {
    const user = userEvent.setup();
    fakeFetch([profile()]);
    render(<Harness />);
    await checkOn(user);
    await screen.findByRole('button', { name: 'Check · 3' });
    const area = screen.getByLabelText('Chapter text') as HTMLTextAreaElement;
    area.setSelectionRange(0, 0);

    await user.click(screen.getByRole('button', { name: 'Next issue' }));
    expect(area.selectionStart).toBe(TEXT.indexOf('Chàng'));
    await user.click(screen.getByRole('button', { name: 'Next issue' }));
    expect(area.selectionStart).toBe(TEXT.lastIndexOf('mẹ cô'));
    await user.click(screen.getByRole('button', { name: 'Previous issue' }));
    expect(area.selectionStart).toBe(TEXT.indexOf('Chàng'));
    // Wraps around at both ends.
    await user.click(screen.getByRole('button', { name: 'Previous issue' }));
    await user.click(screen.getByRole('button', { name: 'Previous issue' }));
    expect(area.selectionStart).toBe(TEXT.lastIndexOf('mẹ cô'));
  });

  it('nextScrollsTheHitIntoView: scrolls the hit mark, not the whole text box', async () => {
    const user = userEvent.setup();
    fakeFetch([profile()]);
    const long = `${'Một dòng dài không có gì.'.repeat(400).split('.').join('.\n\n')}Chàng đến.`;
    render(<Harness initial={long} />);
    await checkOn(user);
    await screen.findByRole('button', { name: 'Check · 1' });
    const area = screen.getByLabelText('Chapter text') as HTMLTextAreaElement;
    area.setSelectionRange(0, 0);
    const spy = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = spy;
    try {
      await user.click(screen.getByRole('button', { name: /^Next issue/ }));
      await waitFor(() => expect(spy).toHaveBeenCalled());
      const target = spy.mock.instances[0] as HTMLElement;
      expect(target).not.toBe(area);
      expect(target.tagName).toBe('MARK');
      expect(target.textContent).toBe('Chàng');
      expect(spy).toHaveBeenCalledWith({ block: 'center' });
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('ignoredLinesNoticeShown', async () => {
    const user = userEvent.setup();
    fakeFetch([profile()]);
    render(<Harness />);

    await checkOn(user);

    expect(await screen.findByText('1 line in ## Kiểm tra could not be read')).toBeInTheDocument();
  });

  it('picks up an edited profile each time Check is switched on', async () => {
    const user = userEvent.setup();
    const calls = fakeFetch([profile()]);
    render(<Harness />);
    await checkOn(user);
    await screen.findByRole('button', { name: 'Check · 3' });
    await user.click(screen.getByRole('button', { name: 'Check · 3' }));
    await act(async () => {});

    await user.click(screen.getByRole('button', { name: 'Check' }));

    await waitFor(() => expect(calls.filter((c) => c.path === '/api/novels/3/profile')).toHaveLength(3));
  });
});
