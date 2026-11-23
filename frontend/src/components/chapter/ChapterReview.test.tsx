import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fakeFetch, problem, type Route } from '../../test/fakeFetch';
import { chapterDetail } from '../../test/novelFixtures';
import { ChapterTextEditor } from './ChapterTextEditor';

const FILE = 'review-P-ch-2-2026-11-23.md';
const MARKDOWN = [
  '## Sửa',
  '',
  '| Mục | Dòng | Đoạn cũ | Đoạn mới |',
  '|---|---|---|---|',
  '| 🔴1 | 1 | Emi cúi xuống. | Emi ghé lại gần. |',
  '| 🔴2 | 5 | Một câu không còn trong chương nhưng khá dài để cắt bớt khi hiện danh sách không thấy. | Câu khác |',
  '',
].join('\n');

const reviewRoute = (markdown = MARKDOWN): Route => ({
  method: 'GET',
  path: '/api/chapters/9/review',
  status: 200,
  body: { fileName: FILE, markdown },
});

const TEXT = 'Emi cúi xuống. Bonnie cười.';

const profileRoute: Route = {
  method: 'GET',
  path: '/api/novels/3/profile',
  status: 200,
  body: { name: 'P', text: '## Kiểm tra\n- "cười" → "mỉm cười"\n', sha: 's', stats: { chapters: 0, edits: 0, otherNovels: [] }, geminiConfigured: true },
};
const rulesRoute: Route = { method: 'GET', path: '/api/settings/writing-rules', status: 200, body: { text: null } };

function Harness({
  initial = TEXT,
  sourceType = 'ORIGINAL',
  locked = false,
  onText,
}: {
  initial?: string;
  sourceType?: 'SCREENSHOTS' | 'ORIGINAL';
  locked?: boolean;
  onText?: (t: string) => void;
}) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <ChapterTextEditor
      chapter={chapterDetail({ sourceType })}
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

function caretAt(index: number) {
  const area = screen.getByLabelText('Chapter text') as HTMLTextAreaElement;
  area.focus();
  area.setSelectionRange(index, index);
  fireEvent.click(area);
}

async function reviewOn(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Review' }));
  await screen.findByRole('button', { name: /^Review · \d+$/ });
}

describe('Chapter Review', () => {
  it('shows the Review button only for original stories', () => {
    fakeFetch([profileRoute, rulesRoute]);
    const { unmount } = render(<Harness />);
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
    unmount();

    render(<Harness sourceType="SCREENSHOTS" />);
    expect(screen.queryByRole('button', { name: 'Review' })).not.toBeInTheDocument();
  });

  it('loads the newest review and underlines its passages', async () => {
    const user = userEvent.setup();
    fakeFetch([reviewRoute(), profileRoute, rulesRoute]);
    render(<Harness />);

    await reviewOn(user);

    expect(screen.getByRole('button', { name: 'Review · 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/review-P-ch-2-2026-11-23\.md/)).toBeInTheDocument();
    expect(screen.getByText(/1 to fix · 0 done ·/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1 not found' })).toBeInTheDocument();
  });

  it('applies Đoạn mới', async () => {
    const user = userEvent.setup();
    fakeFetch([reviewRoute(), profileRoute, rulesRoute]);
    const seen = vi.fn();
    render(<Harness onText={seen} />);
    await reviewOn(user);

    caretAt(3);
    const dialog = await screen.findByRole('dialog', { name: 'Check suggestion' });
    expect(dialog).toHaveTextContent('🔴1');
    await user.dblClick(screen.getByRole('button', { name: 'Emi ghé lại gần.' }));

    await waitFor(() => expect(screen.getByLabelText('Chapter text')).toHaveValue('Emi ghé lại gần. Bonnie cười.'));
  });

  it('shows the not-found list', async () => {
    const user = userEvent.setup();
    fakeFetch([reviewRoute(), profileRoute, rulesRoute]);
    render(<Harness />);
    await reviewOn(user);

    await user.click(screen.getByRole('button', { name: '1 not found' }));

    const item = await screen.findByText(/🔴2 — Một câu không còn trong chương/);
    expect(item.textContent).toContain('…');
  });

  it('shows an error when no file exists', async () => {
    const user = userEvent.setup();
    fakeFetch([
      { method: 'GET', path: '/api/chapters/9/review', status: 404, body: problem(404, 'REVIEW_NOT_FOUND', 'No review file found (review-P-ch-2-*.md)') },
      profileRoute,
      rulesRoute,
    ]);
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Review' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No review file found (review-P-ch-2-*.md)');
    expect(screen.getByRole('button', { name: 'Review' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('Review and Check exclude each other', async () => {
    const user = userEvent.setup();
    fakeFetch([reviewRoute(), profileRoute, rulesRoute]);
    render(<Harness />);
    await reviewOn(user);
    const check = screen.getByRole('button', { name: 'Check' });
    await waitFor(() => expect(check).not.toHaveAttribute('aria-disabled'));

    await user.click(check);

    await screen.findByRole('button', { name: /^Check · \d+$/ });
    expect(screen.getByRole('button', { name: 'Review' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /^Check · / })).toHaveAttribute('aria-pressed', 'true');
  });

  it('recomputes after typing without refetching', async () => {
    const user = userEvent.setup();
    const calls = fakeFetch([reviewRoute(), profileRoute, rulesRoute]);
    render(<Harness />);
    await reviewOn(user);
    await screen.findByText(/1 to fix · 0 done ·/);

    fireEvent.change(screen.getByLabelText('Chapter text'), { target: { value: 'Emi ghé lại gần. Bonnie cười.' } });

    await screen.findByText(/0 to fix · 1 done ·/);
    expect(screen.getByRole('button', { name: '1 not found' })).toBeInTheDocument();
    expect(calls.filter((c) => c.path === '/api/chapters/9/review')).toHaveLength(1);
  });

  it('shows "n matches" for a review row hit twice, but not for a Check rule hit twice', async () => {
    const user = userEvent.setup();
    const twice = 'Emi cúi xuống. Rồi Emi cúi xuống. Bonnie cười. Bonnie cười.';
    const calls = fakeFetch([reviewRoute(), profileRoute, rulesRoute]);
    void calls;
    const { unmount } = render(<Harness initial={twice} />);
    await reviewOn(user);
    caretAt(3);
    const dialog = await screen.findByRole('dialog', { name: 'Check suggestion' });
    expect(dialog).toHaveTextContent('2 matches');
    unmount();

    render(<Harness initial={twice} />);
    const check = screen.getByRole('button', { name: 'Check' });
    await waitFor(() => expect(check).not.toHaveAttribute('aria-disabled'));
    await user.click(check);
    await screen.findByRole('button', { name: /^Check · \d+$/ });
    caretAt(twice.indexOf('cười') + 1);
    const popover = await screen.findByRole('dialog', { name: 'Check suggestion' });
    expect(popover).not.toHaveTextContent('matches');
  });
});
