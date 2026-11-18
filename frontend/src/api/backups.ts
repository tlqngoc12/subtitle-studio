import { send } from './client';

export type BackupKind = 'DATABASE' | 'DATA';

export interface BackupItem {
  name: string;
  kind: BackupKind;
  sizeBytes: number;
  createdAt: string;
}

export interface BackupStatus {
  running: boolean;
  /** The latest run; null when there has been none. */
  last: { at: string; ok: boolean; message: string } | null;
  /** Newest first. */
  items: BackupItem[];
}

export async function getBackups(): Promise<BackupStatus> {
  return (await send('/api/backups')).json();
}

/** Starts a run in the background. Fails with BACKUP_RUNNING (409) when one is going. */
export async function startBackup(): Promise<void> {
  await send('/api/backups', { method: 'POST' });
}
