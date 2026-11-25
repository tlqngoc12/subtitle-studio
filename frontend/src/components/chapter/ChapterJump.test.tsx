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
  chapterSummary({ id: 2, chapterNo: 2, title: 'Chương 2' }),
  chapterSummary({ id: 3, chapterNo: 3, title: 'Chương 3: Cơn mưa' }),
  chapterSummary({ id: 4, chapterNo: 10, title: 'Chương 10' }),
  chapterSummary({ id: 5, chapterNo: 100, title: 'Chương 100' }),
];

const getNovel = { method: 'GET', path: '/api/novels/3', status: 200, body: novelDetail({ chapters }) };

function setup(over: { original?: boolean } = {}) {
  const onLeave = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
  render(
    <MemoryRouter>
      <ChapterJump
        novelId={3}
        currentId={3}
        original={over.original ?? false}
        chapterPath={(id) => `/novels/3/chapters/${id}`}
        onLeave={onLeave}
      />
    </MemoryRouter>,
  );
  return onLeave;
}

const open = () => userEvent.click(screen.getByRole('button', { name: 'All chapters' }));
const rows = () => within(screen.getByRole('list', { name: 'Chapters' })).getAllByRole('link');

describe('ChapterJump', () => {
  it('is an icon-only button named All chapters with a tooltip', async () => {
    setup();

    const button = screen.getByRole('button', { name: 'All chapters' });
    expect(button.textContent).toBe('');
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

  it('has no search box, focuses the current chapter and marks it', async () => {
    fakeFetch([getNovel]);
    setup();

    await open();

    await screen.findByRole('list', { name: 'Chapters' });
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    const current = rows().find((r) => r.getAttribute('aria-current') === 'page')!;
    expect(current).toHaveTextContent('Chương 3: Cơn mưa');
    expect(current).toHaveFocus();
    expect(current.closest('li')).toHaveClass('chapter-toc__item--current');
    expect(rows().filter((r) => r.hasAttribute('aria-current'))).toHaveLength(1);
    expect(rows().filter((r) => r.closest('li')!.classList.contains('chapter-toc__item--current'))).toHaveLength(1);
  });

  it('gives every row a title with its full name', async () => {
    fakeFetch([getNovel]);
    setup();

    await open();
    await screen.findByRole('list', { name: 'Chapters' });

    expect(rows().map((r) => r.getAttribute('title'))).toEqual(rows().map((r) => r.textContent));
  });

  it('opens the chosen chapter through onLeave', async () => {
    fakeFetch([getNovel]);
    const onLeave = setup();
    await open();
    await screen.findByRole('list', { name: 'Chapters' });

    await userEvent.click(rows()[3]);

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

  it('holds no focusable element inside a chapter row besides the link', async () => {
    fakeFetch([getNovel]);
    setup();

    await open();
    await screen.findByRole('list', { name: 'Chapters' });

    for (const row of rows()) {
      expect(row.querySelectorAll('[tabindex="0"]')).toHaveLength(0);
      expect(row.querySelectorAll('button, input, [tabindex]')).toHaveLength(0);
    }
    expect(screen.getAllByLabelText('Published').length).toBeGreaterThan(0);
  });
});
