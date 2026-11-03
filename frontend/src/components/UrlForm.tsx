import { useState, type FormEvent } from 'react';

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

  return (
    <form className="frame" onSubmit={handleSubmit} aria-busy={pending}>
      <label className="visually-hidden" htmlFor="url">
        Link YouTube
      </label>
      <label className="visually-hidden" htmlFor="profile">
        Hồ sơ dịch
      </label>
      <div className="frame__caption">
        <input
          id="url"
          className="frame__input"
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="Dán link YouTube vào đây"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <select
          id="profile"
          className="frame__select"
          value={profile}
          disabled={!configured}
          title={configured ? 'Hồ sơ dịch Gemini' : 'Chưa cấu hình GEMINI_API_KEY'}
          onChange={(e) => onProfileChange(e.target.value)}
        >
          <option value="">— Không dịch —</option>
          {profiles.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button className="button button--caption" type="submit" disabled={pending}>
          {pending ? 'Đang lấy phụ đề…' : 'Lấy Engsub'}
        </button>
      </div>
      <div className={pending ? 'frame__scrubber frame__scrubber--busy' : 'frame__scrubber'} aria-hidden="true" />
    </form>
  );
}
