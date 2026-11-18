import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackupStatus } from '../../api/backups';
import SettingsPage from '../../pages/SettingsPage';
import { fakeFetch, problem } from '../../test/fakeFetch';
import { POLL_MS } from './useBackups';

const ITEMS: BackupStatus['items'] = [
  { name: 'ss-20261118-120000.dmp', kind: 'DATABASE', sizeBytes: 14_532_608, createdAt: '2026-11-18T05:00:00Z' },
  { name: 'data-20261118-120000.zip', kind: 'DATA', sizeBytes: 94_371_840, createdAt: '2026-11-18T05:00:00Z' },
  { name: 'ss-20261117-120000.dmp', kind: 'DATABASE', sizeBytes: 14_000_000, createdAt: '2026-11-17T05:00:00Z' },
];

const status = (over: Partial<BackupStatus> = {}): BackupStatus => ({
  running: false,
  last: { at: '2026-11-18T05:00:00Z', ok: true, message: 'Saved database 13.9 MB, data files 90.0 MB' },
  items: ITEMS,
  ...over,
});

function renderTab() {
  return render(
    <MemoryRouter initialEntries={['/settings/backups']}>
      <SettingsPage tab="backups" />
    </MemoryRouter>,
  );
}

const get = (body: BackupStatus) => ({ method: 'GET', path: '/api/backups', status: 200, body });

describe('Settings › Backups', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('listsBackupsNewestFirst', async () => {
    fakeFetch([get(status())]);
    renderTab();

    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('18/11/2026 12:00');
    expect(rows[0]).toHaveTextContent('Database');
    expect(rows[0]).toHaveTextContent('13.9 MB');
    expect(rows[1]).toHaveTextContent('Data files');
    expect(rows[1]).toHaveTextContent('90.0 MB');
    expect(rows[2]).toHaveTextContent('17/11/2026 12:00');
    expect(screen.getByText(/· OK · Saved database/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Backup now' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Backups' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows an empty state without backups', async () => {
    fakeFetch([get(status({ items: [], last: null }))]);
    renderTab();

    expect(await screen.findByText(/No backups yet/)).toBeInTheDocument();
  });

  it('failedLastRunShown', async () => {
    fakeFetch([get(status({ last: { at: '2026-11-18T05:00:00Z', ok: false, message: 'Database backup needs Oracle' } }))]);
    renderTab();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Last backup failed');
    expect(alert).toHaveTextContent('Database backup needs Oracle');
  });

  describe('Backup now', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    it('backupNowStartsAndPollsUntilDone', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      let polls = 0;
      let started = false;
      const info = vi.spyOn(toast, 'info');
      const success = vi.spyOn(toast, 'success');
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
          const method = (init?.method ?? 'GET').toUpperCase();
          if (method === 'POST') {
            started = true;
            return new Response(null, { status: 202 });
          }
          if (started) polls += 1;
          // The run lasts for the first three reads after it was started.
          const running = started && polls <= 3;
          return new Response(JSON.stringify(status({ running, items: running ? [] : ITEMS })), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }),
      );
      renderTab();
      await screen.findByRole('table');

      await user.click(screen.getByRole('button', { name: 'Backup now' }));
      const busy = await screen.findByRole('button', { name: 'Backing up…' });
      expect(busy).toBeDisabled();
      expect(info).toHaveBeenCalledWith('Backup started');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS * 3);
      });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Backup now' })).toBeEnabled());
      expect(success).toHaveBeenCalledWith('Backup completed', expect.anything());
      expect(await screen.findByRole('table')).toBeInTheDocument();

      // It stopped polling once the run was done.
      const settled = polls;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS * 4);
      });
      expect(polls).toBe(settled);
    });

    it('conflictShowsToast', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      fakeFetch([
        get(status()),
        { method: 'POST', path: '/api/backups', status: 409, body: problem(409, 'BACKUP_RUNNING', 'A backup is already running.') },
      ]);
      const warning = vi.spyOn(toast, 'warning');
      renderTab();
      await screen.findByRole('table');

      await user.click(screen.getByRole('button', { name: 'Backup now' }));

      await waitFor(() => expect(warning).toHaveBeenCalledWith('A backup is already running'));
    });
  });

  it('copyRestoreCommandPerKind', async () => {
    const user = userEvent.setup();
    fakeFetch([get(status())]);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    renderTab();
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'Copy restore command for ss-20261118-120000.dmp' }));
    expect(writeText).toHaveBeenLastCalledWith('.\\scripts\\restore-db.ps1 -Dump data\\backups\\ss-20261118-120000.dmp');

    await user.click(screen.getByRole('button', { name: 'Copy restore command for data-20261118-120000.zip' }));
    expect(writeText).toHaveBeenLastCalledWith(
      'Expand-Archive data\\backups\\data-20261118-120000.zip -DestinationPath data -Force',
    );
  });

  it('keeps the restore steps collapsed until asked', async () => {
    const user = userEvent.setup();
    fakeFetch([get(status())]);
    renderTab();
    await screen.findByRole('table');

    const details = screen.getByText('How to restore').closest('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    await user.click(screen.getByText('How to restore'));
    expect(details.open).toBe(true);
    expect(within(details).getByText('docker compose stop subtitle-studio')).toBeInTheDocument();
  });
});
