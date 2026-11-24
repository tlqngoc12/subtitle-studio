import { Archive, Copy, TriangleAlert } from 'lucide-react';
import type { BackupItem, BackupStatus } from '../../api/backups';
import type { ErrorMessage } from '../../lib/errors';
import { formatInstantWithTime } from '../../lib/dates';
import { toastCopied, toastCopyFailed } from '../../lib/toast';
import { EmptyState } from '../EmptyState';
import { Alert } from '../ui/Alert';
import { DisclosureSummary } from '../ui/DisclosureSummary';
import { IconButton } from '../ui/IconButton';
import { LoadingText } from '../ui/LoadingText';
import './BackupsPanel.css';

/** The command that restores one backup; copied from the Restore column. */
export function restoreCommand(item: Pick<BackupItem, 'name' | 'kind'>): string {
  return item.kind === 'DATABASE'
    ? `.\\scripts\\restore-db.ps1 -Dump data\\backups\\${item.name}`
    : `Expand-Archive data\\backups\\${item.name} -DestinationPath data -Force`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** A backup older than this (or none) is a warning: the daily one did not run. */
const STALE_MS = 24 * 60 * 60 * 1000;

/** When the newest dump or zip was made, as an ISO instant; null when there is none. */
function newestBackup(items: BackupItem[]): string | null {
  return items.reduce<string | null>((newest, i) => (newest === null || i.createdAt > newest ? i.createdAt : newest), null);
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    toastCopyFailed();
    return;
  }
  toastCopied();
}

/**
 * Settings › Backups: a warning when the newest backup is over 24 hours old (or there is none), the result of the
 * last run, the list of backups (newest first) with a button that copies the restore command, and the restore steps.
 * "Backup now" is the tab's toolbar action (SettingsPage), so it is not here.
 */
export function BackupsPanel({ status, error }: { status: BackupStatus | null; error: ErrorMessage | null }) {
  if (error && !status) return <Alert title={error.title} hint={error.hint} />;
  if (!status) return <LoadingText>Loading the backups…</LoadingText>;

  const newest = newestBackup(status.items);
  const stale = newest === null || Date.now() - Date.parse(newest) > STALE_MS;

  return (
    <div className="backups">
      {error && <Alert title={error.title} hint={error.hint} />}
      {stale && (
        <p className="backups__stale">
          <span className="badge badge--warn" role="status">
            <TriangleAlert className="icon icon--sm" aria-hidden="true" />
            {newest === null
              ? 'No backup has been made yet'
              : `Over 24 hours since the last backup (${formatInstantWithTime(newest)})`}
          </span>
        </p>
      )}
      {status.running && (
        <p className="backups__last muted" role="status">
          A backup is running…
        </p>
      )}
      {status.last &&
        (status.last.ok ? (
          <p className="backups__last">
            <span className="backups__label">Last backup</span> {formatInstantWithTime(status.last.at)} · OK
            {status.last.message ? ` · ${status.last.message}` : ''}
          </p>
        ) : (
          <Alert title={`Last backup failed (${formatInstantWithTime(status.last.at)})`} hint={status.last.message} />
        ))}

      {status.items.length === 0 ? (
        <EmptyState icon={Archive}>No backups yet. Choose Backup now to make the first one.</EmptyState>
      ) : (
        <table className="backups__table">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Kind</th>
              <th scope="col">Size</th>
              <th scope="col">Restore</th>
            </tr>
          </thead>
          <tbody>
            {status.items.map((item) => (
              <tr key={item.name}>
                <td>{formatInstantWithTime(item.createdAt)}</td>
                <td>{item.kind === 'DATABASE' ? 'Database' : 'Data files'}</td>
                <td>{formatSize(item.sizeBytes)}</td>
                <td>
                  <IconButton
                    size="s"
                    icon={Copy}
                    label={`Copy restore command for ${item.name}`}
                    onClick={() => void copy(restoreCommand(item))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <details className="backups__help">
        <DisclosureSummary>How to restore</DisclosureSummary>
        <div className="backups__help-body">
          <h2>Database</h2>
          <ol>
            <li>
              <code>docker compose stop subtitle-studio</code>
            </li>
            <li>
              <code>{'.\\scripts\\restore-db.ps1 -Dump data\\backups\\<file>.dmp'}</code>
            </li>
            <li>
              <code>docker compose start subtitle-studio</code>
            </li>
          </ol>
          <p className="muted">
            To try a restore without touching the live data, add <code>-TargetSchema SS_RESTORE_TEST</code>.
          </p>
          <h2>Data files</h2>
          <ol>
            <li>Stop the app.</li>
            <li>
              Unzip <code>&lt;file&gt;.zip</code> over <code>./data</code>.
            </li>
            <li>Start the app.</li>
          </ol>
        </div>
      </details>
    </div>
  );
}
