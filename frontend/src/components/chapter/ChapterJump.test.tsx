import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { fakeFetch, problem } from '../../test/fakeFetch';
import { chapterSummary, novelDetail } from '../../test/novelFixtures';
import { expectTooltip } from '../../test/tooltip';
import { ChapterJump } from './ChapterJump';

const chapters = [
  chapterSummary({ id: 1, chapterNo: 1, title: 'Mở đầu' }),
  chapterSummary({ id: 2, chapterNo: 2, title: null }),
  chapterSummary({ id: 3, chapterNo: 3, title: 'Cơn mưa' }),
  chapterSummary({ id: 4, chapterNo: 10, title: null }),
  chapterSummary({ id: 5, chapterNo: 100, title: null }),
];

const getNovel = { method: 'GET', path: '/api/novels/3', status: 200, body: novelDetail({ chapters }) };

function setup(over: { original?: boolean } = {}) {
  const onLeave = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
  render(
    <MemoryRouter>
      <ChapterJump
        novelId={3}
        currentId={3}
        position={3}
        total={42}
        original={over.original ?? false}
        chapterPath={(id) => `/novels/3/chapters/${id}`}
        onLeave={onLeave}
      />
    </MemoryRouter>,
  );
  return onLeave;
}

const open = () => userEvent.click(screen.getByRole('button', { name: /3 \/ 42/ }));
const rows = () => within(screen.getByRole('list', { name: 'Chapters' })).getAllByRole('link');

describe('ChapterJump', () => {
  it('shows the place as 3 / 42 with an "All chapters" tooltip', async () => {
    setup();

    const button = screen.getByRole('button', { name: /3 \/ 42/ });
    expect(button).toHaveTextContent('3 / 42');
    await expectTooltip(button, 'All chapters');
  });

  it('fetches the novel once, on first open, and not again on a second open', async () => {
    const calls = fakeFetch([getNovel]);
    setup();
    expect(calls).toHaveLength(0);

    await open();
    await screen.findByRole('list', { name: 'Chapters' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Chapters' })).not.toBeInTheDocument());
    await open();
    await screen.findByRole('list', { name: 'Chapters' });

    expect(calls.filter((c) => c.path === '/api/novels/3')).toHaveLength(1);
  });

  it('focuses the search box and marks the current chapter', async () => {
    fakeFetch([getNovel]);
    setup();

    await open();

    expect(await screen.findByRole('searchbox', { name: 'Find a chapter' })).toHaveFocus();
    const current = rows().find((r) => r.getAttribute('aria-current') === 'page')!;
    expect(current).toHaveTextContent('Chapter 3: Cơn mưa');
    expect(rows().filter((r) => r.hasAttribute('aria-current'))).toHaveLength(1);
  });

  it('filters by name without marks, by chapter number first, and says when nothing matches', async () => {
    fakeFetch([getNovel]);
    setup();
    const user = userEvent.setup();
    await open();
    const box = await screen.findByRole('searchbox', { name: 'Find a chapter' });

    await user.type(box, 'mua');
    expect(rows().map((r) => r.textContent)).toEqual(['Chapter 3: Cơn mưa']);

    await user.clear(box);
    await user.type(box, '10');
    expect(rows().map((r) => r.textContent)).toEqual(['Chapter 10', 'Chapter 100']);

    await user.clear(box);
    await user.type(box, 'zzz');
    expect(screen.getByText('No chapters match.')).toBeInTheDocument();
  });

  it('moves with the arrow keys and opens the chosen chapter through onLeave', async () => {
    fakeFetch([getNovel]);
    const onLeave = setup();
    const user = userEvent.setup();
    await open();
    await screen.findByRole('searchbox', { name: 'Find a chapter' });

    await user.keyboard('{ArrowDown}{Enter}');

    expect(onLeave).toHaveBeenCalledWith(expect.anything(), '/novels/3/chapters/4');
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Chapters' })).not.toBeInTheDocument());
  });

  it('closes on Escape', async () => {
    fakeFetch([getNovel]);
    setup();
    await open();
    await screen.findByRole('list', { name: 'Chapters' });

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('list', { name: 'Chapters' })).not.toBeInTheDocument());
  });

  it('says it could not load the chapters and retries', async () => {
    const calls = fakeFetch([{ method: 'GET', path: '/api/novels/3', status: 500, body: problem(500, 'X', 'boom') }]);
    setup();

    await open();
    expect(await screen.findByText("Couldn't load chapters.")).toBeInTheDocument();

    fakeFetch([getNovel]);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('list', { name: 'Chapters' })).toBeInTheDocument();
    expect(calls).toHaveLength(1);
  });

  it('shows no translation icon for an original story', async () => {
    fakeFetch([getNovel]);
    setup({ original: true });

    await open();
    await screen.findByRole('list', { name: 'Chapters' });

    expect(screen.queryByLabelText(/^Translated/)).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('Published').length).toBeGreaterThan(0);
  });

  it('shows the translation icon for a translated novel', async () => {
    fakeFetch([getNovel]);
    setup();

    await open();
    await screen.findByRole('list', { name: 'Chapters' });

    expect(screen.getAllByLabelText('Translated').length).toBeGreaterThan(0);
  });
});
