import { useState, type FormEvent } from 'react';
import { Tip } from './Tip';

interface Props {
  pending: boolean;
  onSubmit: (url: string) => void;
  /** Translation profiles from ./data/prompts. */
  profiles: string[];
  /** Whether GEMINI_API_KEY is set; otherwise the profile list is disabled. */
  configured: boolean;
  /** Chosen profile; '' means no translation. */
  profile: string;
  onProfileChange: (profile: string) => void;
}

/** The "video frame": the link is typed where a subtitle line would appear. */
export function UrlForm({ pending, onSubmit, profiles, configured, profile, onProfileChange }: Props) {
  const [url, setUrl] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (trimmed && !pending) onSubmit(trimmed);
  }

  const select = (
    <select
      id="profile"
      className="frame__select"
      value={profile}
      disabled={!configured}
      onChange={(e) => onProfileChange(e.target.value)}
    >
      <option value="">— No translation —</option>
      {profiles.map((p) => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
    </select>
  );

  return (
    <form className="frame" onSubmit={handleSubmit} aria-busy={pending}>
      <label className="visually-hidden" htmlFor="url">
        YouTube link
      </label>
      <label className="visually-hidden" htmlFor="profile">
        Translation profile
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
        {/* A disabled select gets no pointer events, so the tip sits on a wrapper; the structure stays the
            same whether Gemini is configured or not, so the select is never remounted. */}
        <Tip label="GEMINI_API_KEY is not set" disabled={configured}>
          <span className="tip-target" tabIndex={configured ? undefined : 0}>
            {select}
          </span>
        </Tip>
        <button className="button button--caption" type="submit" disabled={pending}>
          {pending ? 'Fetching subtitles…' : 'Get Engsub'}
        </button>
      </div>
      <div className={pending ? 'frame__scrubber frame__scrubber--busy' : 'frame__scrubber'} aria-hidden="true" />
    </form>
  );
}
