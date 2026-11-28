import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WattpadSyncPart, WattpadSyncPlan } from '../../api/novels';
import { fakeFetch, problem, type Route } from '../../test/fakeFetch';
import { WattpadSyncAllDialog, confirmCopy, defaultSelection, selectable } from './WattpadSyncAllDialog';

vi.mock('sonner', async (orig) => ({
  ...(await orig<typeof import('sonner')>()),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const part = (over: Partial<WattpadSyncPart>): WattpadSyncPart => ({
  partId: '1',
  title: 'Part',
  modifiedAt: '2026-11-28T07:30:00Z',
  wordCount: 1200,
  status: 'UPDATED',
  chapterId: 5,
  chapterTitle: 'Chương 1: Mở đầu',
  lastSyncedAt: '2026-11-25T02:10:00Z',
  ...over,
});

const PLAN: WattpadSyncPlan = {
  upToDate: 3,
  parts: [
    part({ partId: '1', title: 'Updated one' }),
    part({ partId: '2', title: 'Brand new', status: 'NEW_PART', chapterId: null, chapterTitle: null, lastSyncedAt: null }),
    part({ partId: '3', title: 'Edited here', status: 'LOCAL_EDITS', chapterId: 7, chapterTitle: 'Chương 3' }),
    part({ partId: '4', title: 'Same name', status: 'NOT_SYNCED', chapterId: 8, chapterTitle: 'Same name', lastSyncedAt: null }),
    part({ partId: '5', title: 'Live', status: 'PUBLISHED', chapterId: 9, chapterTitle: 'Chương 5' }),
    part({ partId: '6', title: 'Removed', status: 'DELETED', chapterId: null, chapterTitle: null, modifiedAt: null }),
  ],
};

const planRoute = (body: unknown = PLAN, status = 200): Route => ({
  method: 'GET', path: '/api/novels/3/wattpad/sync-plan', status, body,
});

function open() {
  const onOpenChange = vi.fn();
  const onChanged = vi.fn();
  render(<WattpadSyncAllDialog open onOpenChange={onOpenChange} novelId={3} onChanged={onChanged} />);
  return { onOpenChange, onChanged };
}

const check = (name: RegExp) => screen.getByRole('checkbox', { name });

/** A button of the dialog's action bar (the header also has a Close icon button). */
const footerButton = (name: string) =>
  within(document.querySelector('.form-actions') as HTMLElement).getByRole('button', { name });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('plan rules', () => {
  it('ticks updated and new parts by default, and only parts that can be synced are selectable', () => {
    expect([...defaultSelection(PLAN.parts)]).toEqual(['1', '2']);
    expect(PLAN.parts.map((p) => selectable(p.status))).toEqual([true, true, true, true, false, false]);
  });

  it('words the confirmation with the counts', () => {
    expect(confirmCopy(2, 1, 0)).toEqual({
      title: 'Sync 3 chapters from Wattpad?',
      body: 'The text of 2 chapters will be replaced by their Wattpad version and 1 new chapter will be added. Replaced text cannot be restored. Chapter titles stay the same.',
    });
    expect(confirmCopy(1, 0, 1).body).toBe(
      'The text of 1 chapter will be replaced by their Wattpad version. Replaced text cannot be restored. Chapter titles stay the same. 1 of them was edited in the app or never synced.',
    );
    expect(confirmCopy(0, 2, 0)).toEqual({
      title: 'Sync 2 chapters from Wattpad?',
      body: '2 new chapters will be added. Chapter titles stay the same.',
    });
  });
});

describe('WattpadSyncAllDialog', () => {
  it('asks Wattpad once, lists the parts in order and ticks the updated and new ones', async () => {
    const calls = fakeFetch([planRoute()]);
    open();

    expect(screen.getByText('Checking Wattpad…')).toBeInTheDocument();
    expect(await screen.findByRole('checkbox', { name: /Updated one/ })).toBeChecked();
    expect(check(/Brand new/)).toBeChecked();
    expect(check(/Edited here/)).not.toBeChecked();
    expect(check(/Same name/)).not.toBeChecked();
    expect(check(/Live/)).toBeDisabled();
    expect(check(/Removed/)).toBeDisabled();
    expect(screen.getAllByRole('checkbox').map((c) => c.closest('label')!.querySelector('.wattpad-sync__title')!.textContent))
      .toEqual(['Updated one', 'Brand new', 'Edited here', 'Same name', 'Live', 'Removed']);
    expect(screen.getByRole('button', { name: 'Sync 2' })).toBeEnabled();
    expect(screen.getByText('3 chapters up to date')).toBeInTheDocument();
    expect(calls.filter((c) => c.path.endsWith('/sync-plan'))).toHaveLength(1);
  });

  it('shows each part with its Wattpad date, the chapter it replaces, a badge and a warning', async () => {
    fakeFetch([planRoute()]);
    open();
    await screen.findByRole('checkbox', { name: /Updated one/ });

    const updated = check(/Updated one/).closest('label')!;
    expect(updated).toHaveTextContent('28/11/2026 14:30');
    expect(updated).toHaveTextContent('→ Chương 1: Mở đầu');
    expect(within(updated).getByText('Updated on Wattpad')).toHaveClass('badge--progress');
    expect(check(/Brand new/).closest('label')).toHaveTextContent('New chapter');
    const edited = check(/Edited here/).closest('label')!;
    expect(edited).toHaveTextContent('Edited in the app since the last sync');
    expect(check(/Same name/).closest('label')).toHaveTextContent("Never synced: the app's text will be replaced");
    expect(check(/Live/).closest('label')).toHaveTextContent('Unpublish to sync');
    expect(check(/Removed/).closest('label')).toHaveTextContent('Deleted on Wattpad');
    // Every status badge starts with an icon (colour alone does not carry the meaning).
    document.querySelectorAll('.wattpad-sync__meta .badge').forEach((b) => {
      expect(b.firstElementChild?.tagName.toLowerCase()).toBe('svg');
    });
  });

  it('says everything is up to date when nothing can be synced', async () => {
    fakeFetch([planRoute({ upToDate: 5, parts: [PLAN.parts[4], PLAN.parts[5]] })]);
    const { onOpenChange } = open();

    expect(await screen.findByText('Everything is up to date with Wattpad.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Sync/ })).not.toBeInTheDocument();
    await userEvent.setup().click(footerButton('Close'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows a load error with Retry', async () => {
    const calls = fakeFetch([planRoute(problem(502, 'WATTPAD_UNAVAILABLE', 'down'), 502)]);
    open();

    expect(await screen.findByRole('alert')).toHaveTextContent('Wattpad did not answer. Try again later.');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(calls.filter((c) => c.path.endsWith('/sync-plan'))).toHaveLength(2));
  });

  it('Sync N is off until something is ticked', async () => {
    fakeFetch([planRoute()]);
    open();
    const user = userEvent.setup();
    await screen.findByRole('checkbox', { name: /Updated one/ });

    await user.click(check(/Updated one/));
    await user.click(check(/Brand new/));

    expect(screen.getByRole('button', { name: 'Sync' })).toBeDisabled();
  });

  it('confirms with the counts, and Cancel goes back without calling the API', async () => {
    const calls = fakeFetch([planRoute()]);
    open();
    const user = userEvent.setup();
    await screen.findByRole('checkbox', { name: /Updated one/ });

    await user.click(screen.getByRole('button', { name: 'Sync 2' }));

    const confirm = screen.getByRole('group', { name: 'Sync 2 chapters from Wattpad?' });
    expect(confirm).toHaveTextContent(
      'The text of 1 chapter will be replaced by their Wattpad version and 1 new chapter will be added. Replaced text cannot be restored. Chapter titles stay the same.',
    );
    expect(confirm).not.toHaveTextContent('edited in the app or never synced');
    expect(within(confirm).getByRole('button', { name: 'Sync' })).not.toHaveClass('button--danger-solid');
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));

    expect(check(/Updated one/)).toBeChecked();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('turns the Sync button red and adds a sentence when a part edited in the app or never synced is ticked', async () => {
    fakeFetch([planRoute()]);
    open();
    const user = userEvent.setup();
    await screen.findByRole('checkbox', { name: /Updated one/ });
    await user.click(check(/Edited here/));
    await user.click(check(/Same name/));

    await user.click(screen.getByRole('button', { name: 'Sync 4' }));

    const confirm = screen.getByRole('group', { name: 'Sync 4 chapters from Wattpad?' });
    expect(confirm).toHaveTextContent('2 of them were edited in the app or never synced.');
    expect(within(confirm).getByRole('button', { name: 'Sync' })).toHaveClass('button--danger-solid');
  });

  it('posts the ticked parts with their chapters, then closes, reloads and toasts', async () => {
    const calls = fakeFetch([
      planRoute(),
      { method: 'POST', path: '/api/novels/3/wattpad/sync', status: 200, body: { synced: 1, created: 1, failed: [] } },
    ]);
    const { onOpenChange, onChanged } = open();
    const user = userEvent.setup();
    await screen.findByRole('checkbox', { name: /Updated one/ });
    await user.click(screen.getByRole('button', { name: 'Sync 2' }));

    await user.click(within(screen.getByRole('group', { name: /Sync 2 chapters/ })).getByRole('button', { name: 'Sync' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(JSON.parse(String(calls.find((c) => c.method === 'POST')!.body))).toEqual({
      items: [{ partId: '1', chapterId: 5 }, { partId: '2', chapterId: null }],
    });
    expect(onChanged).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith('Synced with Wattpad', { description: 'Synced 1, added 1' });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('locks the dialog while it runs', async () => {
    let release!: () => void;
    const delay = new Promise<void>((r) => (release = r));
    fakeFetch([
      planRoute(),
      { method: 'POST', path: '/api/novels/3/wattpad/sync', status: 200, body: { synced: 2, created: 0, failed: [] }, delay },
    ]);
    const { onOpenChange } = open();
    const user = userEvent.setup();
    await screen.findByRole('checkbox', { name: /Updated one/ });
    await user.click(screen.getByRole('button', { name: 'Sync 2' }));
    await user.click(within(screen.getByRole('group')).getByRole('button', { name: 'Sync' }));

    expect(screen.getByText('Syncing…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(onOpenChange).not.toHaveBeenCalled();
    release();

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('keeps the dialog open with the failed parts and their reasons, and toasts the count', async () => {
    fakeFetch([
      planRoute(),
      {
        method: 'POST', path: '/api/novels/3/wattpad/sync', status: 200,
        body: {
          synced: 1, created: 0,
          failed: [
            { partId: '2', title: 'Brand new', code: 'WATTPAD_PART_EMPTY', message: 'Wattpad has no text' },
            { partId: '3', title: 'Edited here', code: 'CHAPTER_PUBLISHED', message: 'Published' },
          ],
        },
      },
    ]);
    const { onOpenChange, onChanged } = open();
    const user = userEvent.setup();
    await screen.findByRole('checkbox', { name: /Updated one/ });
    await user.click(screen.getByRole('button', { name: 'Sync 2' }));
    await user.click(within(screen.getByRole('group')).getByRole('button', { name: 'Sync' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('2 chapters could not be synced');
    expect(alert).toHaveTextContent('Brand new: Wattpad has no text for this part (locked, empty or removed).');
    expect(alert).toHaveTextContent('Edited here: The chapter is Published. Unpublish it to sync.');
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith('Synced with Wattpad', { description: 'Synced 1, added 0' });
    expect(vi.mocked(toast.error).mock.calls[0][0]).toBe('2 chapters could not be synced');
    await user.click(footerButton('Close'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('goes back to the list with the reason when another sync is already running', async () => {
    fakeFetch([
      planRoute(),
      { method: 'POST', path: '/api/novels/3/wattpad/sync', status: 409, body: problem(409, 'WATTPAD_SYNC_RUNNING', 'x') },
    ]);
    const { onOpenChange, onChanged } = open();
    const user = userEvent.setup();
    await screen.findByRole('checkbox', { name: /Updated one/ });
    await user.click(screen.getByRole('button', { name: 'Sync 2' }));
    await user.click(within(screen.getByRole('group')).getByRole('button', { name: 'Sync' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A sync with Wattpad is already running for this story.');
    expect(check(/Updated one/)).toBeChecked();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });
});
