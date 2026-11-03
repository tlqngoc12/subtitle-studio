import { useState, type FormEvent } from 'react';

interface Props {
  pending: boolean;
  onSubmit: (url: string) => void;
}

/** The "video frame": the link is typed where a subtitle line would appear. */
export function UrlForm({ pending, onSubmit }: Props) {
  const [url, setUrl] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (trimmed && !pending) onSubmit(trimmed);
  }

  return (
    <form className="frame" onSubmit={handleSubmit} aria-busy={pending}>
      <label className="visually-hidden" htmlFor="url">
        YouTube link
      </label>
      <div className="frame__caption">
        <input
          id="url"
          className="frame__input"
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste a YouTube link here"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button className="button button--caption" type="submit" disabled={pending}>
          {pending ? 'Fetching subtitles…' : 'Get Engsub'}
        </button>
      </div>
      <div className={pending ? 'frame__scrubber frame__scrubber--busy' : 'frame__scrubber'} aria-hidden="true" />
    </form>
  );
}
