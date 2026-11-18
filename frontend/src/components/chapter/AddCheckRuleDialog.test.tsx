import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { problem } from '../../test/fakeFetch';
import { chapterDetail } from '../../test/novelFixtures';
import { ChapterTextEditor } from './ChapterTextEditor';

const PROFILE = '## Xưng hô\n- Emi\n\n## Kiểm tra\n- "mẹ cô" → "mẹ em"\n\n## Tóm tắt nội dung chính\n- x\n';
const TEXT = 'Mẹ cô cười. Cô ta khóc.';

type Reply = { status: number; body?: unknown };
type Put = { text: string; baseSha: string };

/** A fetch fake driven by a function, so a test can answer the same route differently each time. */
function stubFetch(handler: (method: string, path: string, body: unknown) => Reply) {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ method, path: String(input), body });
      const r = handler(method, String(input), body);
      return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
        status: r.status,
        headers: { 'Content-Type': r.status >= 400 ? 'application/problem+json' : 'application/json' },
      });
    }),
  );
  return calls;
}

const details = (text: string, sha: string): Reply => ({
  status: 200,
  body: { name: 'P', text, sha, stats: { chapters: 0, edits: 0, otherNovels: [] }, geminiConfigured: true },
});

function Harness({ locked = false, initial = TEXT }: { locked?: boolean; initial?: string }) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <ChapterTextEditor
      chapter={chapterDetail()}
      idBase="c"
      showOriginal={false}
      text={text}
      onTextChange={setText}
      textRef={ref}
      locked={locked}
      hits={{ matches: [], current: null }}
      finding={false}
    />
  );
}

function select(from: number, to: number) {
  const area = screen.getByLabelText('Chapter text') as HTMLTextAreaElement;
  area.focus();
  area.setSelectionRange(from, to);
  fireEvent.select(area);
}

const addButton = () => screen.getByRole('button', { name: 'Add to check rules' });

/** Waits for the profile to load (Check becomes usable), which also settles the "has a profile" state. */
async function loaded() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Check' })).not.toHaveAttribute('aria-disabled'));
}

afterEach(() => vi.restoreAllMocks());

describe('Add to check rules', () => {
  it('disabledWithoutSelection', async () => {
    stubFetch(() => details(PROFILE, 's1'));
    render(<Harness />);
    await loaded();
    expect(addButton()).toHaveAttribute('aria-disabled', 'true');
    select(3, 3);
    expect(addButton()).toHaveAttribute('aria-disabled', 'true');
  });

  it('enabledForAShortSelection', async () => {
    stubFetch(() => details(PROFILE, 's1'));
    render(<Harness />);
    await loaded();
    select(12, 17);
    expect(addButton()).not.toHaveAttribute('aria-disabled');
  });

  it('disabledOver60Chars', async () => {
    stubFetch(() => details(PROFILE, 's1'));
    render(<Harness initial={'a'.repeat(61) + ' b'} />);
    await loaded();
    select(0, 61);
    expect(addButton()).toHaveAttribute('aria-disabled', 'true');
    select(0, 60);
    expect(addButton()).not.toHaveAttribute('aria-disabled');
  });

  it('disabledWithNewlineOrQuote', async () => {
    stubFetch(() => details(PROFILE, 's1'));
    render(<Harness initial={'ab\ncd "ef"'} />);
    await loaded();
    select(0, 5); // "ab\ncd"
    expect(addButton()).toHaveAttribute('aria-disabled', 'true');
    select(6, 10); // "ef" with its quote marks
    expect(addButton()).toHaveAttribute('aria-disabled', 'true');
    select(7, 9);
    expect(addButton()).not.toHaveAttribute('aria-disabled');
  });

  it('disabledWithoutProfile', async () => {
    stubFetch(() => ({ status: 404, body: problem(404, 'NO_PROFILE', 'none') }));
    render(<Harness />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check' })).toHaveAttribute('aria-disabled', 'true'));
    select(0, 5);
    expect(addButton()).toHaveAttribute('aria-disabled', 'true');
  });

  it('disabledWhileLocked', async () => {
    stubFetch(() => details(PROFILE, 's1'));
    render(<Harness locked />);
    select(0, 5);
    expect(addButton()).toHaveAttribute('aria-disabled', 'true');
  });

  it('prefillsSelection', async () => {
    const user = userEvent.setup();
    stubFetch(() => details(PROFILE, 's1'));
    render(<Harness />);
    await loaded();
    select(11, 17); // " Cô ta" with a leading space
    await user.click(addButton());
    const dialog = await screen.findByRole('dialog', { name: 'Add to check rules' });
    expect(within(dialog).getByLabelText(/Wrong phrase/)).toHaveValue('Cô ta');
    expect(within(dialog).getByRole('button', { name: 'Add rule' })).toBeInTheDocument();
  });

  it('savesWithShaAndNewText', async () => {
    const user = userEvent.setup();
    const success = vi.spyOn(toast, 'success').mockReturnValue('t');
    const calls = stubFetch((method) => (method === 'PUT' ? { status: 200, body: { sha: 's2' } } : details(PROFILE, 's1')));
    render(<Harness />);
    await loaded();
    select(12, 17);
    await user.click(addButton());
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Suggestions'), 'cô | em');
    await user.type(within(dialog).getByLabelText('Reason (optional)'), 'Emi là cô');
    await user.click(within(dialog).getByRole('button', { name: 'Add rule' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const put = calls.find((c) => c.method === 'PUT')?.body as Put;
    expect(put.baseSha).toBe('s1');
    expect(put.text).toBe(PROFILE.replace('- "mẹ cô" → "mẹ em"\n', '- "mẹ cô" → "mẹ em"\n- "Cô ta" → "cô" | "em" (Emi là cô)\n'));
    expect(success).toHaveBeenCalledWith('Rule added');
  });

  it('conflictRetriesOnceThenShowsError', async () => {
    const user = userEvent.setup();
    let gets = 0;
    const calls = stubFetch((method) => {
      if (method === 'PUT') return { status: 409, body: problem(409, 'PROFILE_CHANGED', 'changed') };
      gets += 1;
      return details(PROFILE, `s${gets}`);
    });
    render(<Harness />);
    await loaded();
    select(12, 17);
    await user.click(addButton());
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Suggestions'), 'cô');
    const getsBefore = gets;
    await user.click(within(dialog).getByRole('button', { name: 'Add rule' }));

    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    const puts = calls.filter((c) => c.method === 'PUT');
    expect(puts).toHaveLength(2); // one retry, then the error
    expect((puts[0].body as Put).baseSha).toBe(`s${getsBefore + 1}`);
    expect((puts[1].body as Put).baseSha).toBe(`s${getsBefore + 2}`);
    // The dialog stays open with what was typed.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Suggestions')).toHaveValue('cô');
    expect(within(dialog).getByLabelText(/Wrong phrase/)).toHaveValue('Cô ta');
  });

  it('conflictThenSuccessSavesOnTheRetry', async () => {
    const user = userEvent.setup();
    let puts = 0;
    let gets = 0;
    stubFetch((method) => {
      if (method !== 'PUT') {
        gets += 1;
        return details(PROFILE, `s${gets}`);
      }
      puts += 1;
      return puts === 1 ? { status: 409, body: problem(409, 'PROFILE_CHANGED', 'changed') } : { status: 200, body: { sha: 'z' } };
    });
    render(<Harness />);
    await loaded();
    select(12, 17);
    await user.click(addButton());
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Add rule' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(puts).toBe(2);
  });

  it('checkRulesReloadAfterSave', async () => {
    const user = userEvent.setup();
    let saved = false;
    stubFetch((method) => {
      if (method === 'PUT') {
        saved = true;
        return { status: 200, body: { sha: 's2' } };
      }
      return details(saved ? PROFILE.replace('"mẹ em"\n', '"mẹ em"\n- "cô ta" → "cô"\n') : PROFILE, saved ? 's2' : 's1');
    });
    render(<Harness />);
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByRole('button', { name: 'Check · 1' })).toBeInTheDocument(); // "Mẹ cô"

    select(12, 17);
    await user.click(addButton());
    await user.type(within(await screen.findByRole('dialog')).getByLabelText('Suggestions'), 'cô');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add rule' }));

    expect(await screen.findByRole('button', { name: 'Check · 2' })).toBeInTheDocument();
  });
});
