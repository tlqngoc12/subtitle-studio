import { Download, ListChecks, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import {
  importWattpadParts,
  listWattpadParts,
  type WattpadImportResult,
  type WattpadPart,
} from '../../api/novels';
import { formatInstant } from '../../lib/dates';
import { errorMessage, type ErrorMessage } from '../../lib/errors';
import { EmptyState } from '../EmptyState';
import { Alert } from '../ui/Alert';
import { LoadingText } from '../ui/LoadingText';
import './WattpadParts.css';

/**
 * The "Wattpad" tab of a Wattpad novel: the story's parts with checkboxes. Import turns the ticked parts into Draft
 * chapters (their original text, ready to translate); parts already imported link to their chapter. "Check for new
 * chapters" asks Wattpad again, so parts published since show up as not imported.
 */
export function WattpadParts({ novelId, onImported }: { novelId: number; onImported: () => void }) {
  const [parts, setParts] = useState<WattpadPart[] | null>(null);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [failures, setFailures] = useState<WattpadImportResult['failed']>([]);

  const load = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const list = await listWattpadParts(novelId);
      setParts(list);
      // Keep ticks only for parts that can still be imported.
      setSelected((prev) => new Set(list.filter((p) => prev.has(p.partId) && importable(p)).map((p) => p.partId)));
    } catch (e) {
      setError(errorMessage(e));
      setParts((p) => p ?? []);
    } finally {
      setChecking(false);
    }
  }, [novelId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function runImport() {
    setImporting(true);
    setError(null);
    setFailures([]);
    try {
      const result = await importWattpadParts(novelId, [...selected]);
      const text = `Imported ${result.imported.length} · Skipped ${result.skipped.length} · Failed ${result.failed.length}`;
      if (result.failed.length === 0) toast.success(text);
      else toast.message(text);
      setFailures(result.failed);
      setSelected(new Set());
      onImported();
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setImporting(false);
    }
  }

  const fresh = (parts ?? []).filter(importable);

  return (
    <section className="wattpad-parts" aria-label="Wattpad chapters">
      <div className="wattpad-parts__toolbar">
        <button type="button" className="button button--s" disabled={fresh.length === 0 || importing}
          onClick={() => setSelected(new Set(fresh.map((p) => p.partId)))}>
          <ListChecks className="icon" aria-hidden="true" />
          Select all new
        </button>
        <button type="button" className="button button--s" disabled={checking || importing} onClick={() => void load()}>
          <RefreshCw className="icon" aria-hidden="true" />
          {checking ? 'Checking…' : 'Check for new chapters'}
        </button>
        <button type="button" className="button button--primary wattpad-parts__import"
          disabled={selected.size === 0 || importing} aria-busy={importing || undefined} onClick={() => void runImport()}>
          <Download className="icon" aria-hidden="true" />
          {importing ? 'Importing…' : selected.size > 0 ? `Import ${selected.size}` : 'Import'}
        </button>
      </div>

      {error && <Alert title={error.title} hint={error.hint} />}
      {failures.length > 0 && (
        <Alert title={`Could not import ${failures.length} ${failures.length === 1 ? 'part' : 'parts'}`}>
          <ul className="wattpad-parts__failures">
            {failures.map((f) => (
              <li key={f.partId}>
                <strong>{f.title}</strong>: {f.reason}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {parts === null && !error && <LoadingText>Loading parts from Wattpad…</LoadingText>}
      {parts !== null && parts.length === 0 && !error && (
        <EmptyState icon={ListChecks}>Wattpad lists no parts for this story.</EmptyState>
      )}
      {parts !== null && parts.length > 0 && (
        <ul className="wattpad-parts__list" aria-label="Parts">
          {parts.map((p) => (
            <li key={p.partId} className="wattpad-parts__row">
              <label className="wattpad-parts__pick">
                <input type="checkbox" checked={selected.has(p.partId)} disabled={!importable(p) || importing}
                  onChange={() => toggle(p.partId)} />
                <span className="wattpad-parts__title">{p.title}</span>
              </label>
              <span className="wattpad-parts__meta">
                <span className="meta">{p.wordCount.toLocaleString('en-US')} words</span>
                {p.modifiedAt && <span className="meta">{formatInstant(p.modifiedAt)}</span>}
                {p.deleted && <span className="badge badge--progress">Deleted</span>}
                {p.importedChapterId !== null && (
                  <Link className="badge badge--info" to={`/novels/${novelId}/chapters/${p.importedChapterId}`}
                    aria-label={`Imported: open ${p.title}`}>
                    Imported
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function importable(p: WattpadPart): boolean {
  return p.importedChapterId === null && !p.deleted;
}
