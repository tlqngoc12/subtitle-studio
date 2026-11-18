import { Archive, Copy } from 'lucide-react';
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
 * Settings › Backups: the result of the last run, the list of backups (newest first) with a button that copies the
 * restore command, and the restore steps. "Backup now" is the page's header action, so it is not here.
 */
export function BackupsPanel({ status, error }: { status: BackupStatus | null; error: ErrorMessage | null }) {
  if (error && !status) return <Alert title={error.title} hint={error.hint} />;
  if (!status) return <LoadingText>Loading the backups…</LoadingText>;

  return (
    <div className="backups">
      {error && <Alert title={error.title} hint={error.hint} />}
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
