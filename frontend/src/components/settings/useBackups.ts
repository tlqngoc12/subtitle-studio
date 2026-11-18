import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '../../api/client';
import { getBackups, startBackup, type BackupStatus } from '../../api/backups';
import { errorMessage, type ErrorMessage } from '../../lib/errors';
import { toastError } from '../../lib/toast';

/** How often the list is read again while a backup is running. */
export const POLL_MS = 3000;

/**
 * The backups of Settings › Backups: loads the list when `enabled`, starts a run, and polls every 3 s only while the
 * backend says one is running (a toast says how it ended). Owned by the page, so the header button and the list share it.
 */
export function useBackups(enabled: boolean) {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [starting, setStarting] = useState(false);
  const alive = useRef(true);
  const wasRunning = useRef(false);

  const load = useCallback(async () => {
    try {
      const next = await getBackups();
      if (!alive.current) return;
      setStatus(next);
      setError(null);
      if (wasRunning.current && !next.running && next.last) {
        if (next.last.ok) toast.success('Backup completed', { description: next.last.message });
        else toast.warning('Backup incomplete', { description: next.last.message });
      }
      wasRunning.current = next.running;
    } catch (e) {
      if (alive.current) setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  const running = status?.running ?? false;
  useEffect(() => {
    if (!enabled || !running) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, running, load]);

  async function start() {
    setStarting(true);
    try {
      await startBackup();
      wasRunning.current = true;
      toast.info('Backup started');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'BACKUP_RUNNING') toast.warning('A backup is already running');
      else toastError(errorMessage(e));
    } finally {
      if (alive.current) setStarting(false);
    }
    await load();
  }

  return { status, error, starting, running: running || starting, start };
}
