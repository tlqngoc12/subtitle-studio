import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { previewWattpadNovel, type WattpadNovelPreview } from '../../api/novels';
import { errorMessage, type ErrorMessage } from '../../lib/errors';
import { Alert } from '../ui/Alert';
import './WattpadFetch.css';

/**
 * New novel › From Wattpad: paste a story link and Fetch. Nothing is saved; the story's details go to the form below
 * through `onPreview`. `initialUrl` (from `?wattpad=`) is fetched once, as soon as the page opens.
 */
export function WattpadFetch({
  initialUrl,
  onPreview,
}: {
  initialUrl?: string | null;
  onPreview: (preview: WattpadNovelPreview) => void;
}) {
  const id = useId();
  const [url, setUrl] = useState(initialUrl ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const requested = useRef<string | null>(null);

  async function fetchStory(link: string) {
    setLoading(true);
    setError(null);
    try {
      onPreview(await previewWattpadNovel(link.trim()));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialUrl && requested.current !== initialUrl) {
      requested.current = initialUrl;
      void fetchStory(initialUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (url.trim() && !loading) void fetchStory(url);
  }

  return (
    <form className="wattpad-fetch" onSubmit={submit} aria-busy={loading}>
      <div className="field">
        <label htmlFor={id}>Wattpad story link</label>
        <div className="wattpad-fetch__row">
          <input id={id} type="text" inputMode="url" autoComplete="off" placeholder="https://www.wattpad.com/story/…"
            value={url} aria-invalid={error ? true : undefined} onChange={(e) => setUrl(e.target.value)} />
          <button className="button button--primary" type="submit" disabled={loading || !url.trim()}>
            {loading ? 'Fetching…' : 'Fetch'}
          </button>
        </div>
      </div>
      {error && <Alert title={error.title} hint={error.hint} />}
    </form>
  );
}
