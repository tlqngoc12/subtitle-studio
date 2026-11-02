import { useRef, useState, type FormEvent } from 'react';

interface Props {
  pending: boolean;
  onSubmit: (url: string, file: File) => void;
}

export function VietsubForm({ pending, onSubmit }: Props) {
  const [url, setUrl] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    const trimmed = url.trim();
    if (trimmed && file && !pending) onSubmit(trimmed, file);
  }

  return (
    <form className="vsform" onSubmit={handleSubmit} aria-busy={pending}>
      <div className="vsform__field">
        <label htmlFor="vs-url">Link YouTube</label>
        <input
          id="vs-url"
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://www.youtube.com/watch?v=…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>
      <div className="vsform__field">
        <label htmlFor="vs-file">File Vietsub (.srt)</label>
        <input id="vs-file" ref={fileRef} type="file" accept=".srt" />
      </div>
      <button className="button button--primary" type="submit" disabled={pending}>
        {pending ? 'Đang thêm…' : 'Thêm Vietsub'}
      </button>
    </form>
  );
}
