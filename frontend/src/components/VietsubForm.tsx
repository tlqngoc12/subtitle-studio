import { FileUp } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';

interface Props {
  pending: boolean;
  onSubmit: (url: string, file: File) => void;
}

export function VietsubForm({ pending, onSubmit }: Props) {
  const [url, setUrl] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    const trimmed = url.trim();
    if (trimmed && file && !pending) onSubmit(trimmed, file);
  }

  return (
    <form className="vsform" onSubmit={handleSubmit} aria-busy={pending}>
      <div className="vsform__field">
        <label htmlFor="vs-url">YouTube link</label>
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
        <label htmlFor="vs-file">Vietsub file (.srt)</label>
        {/* The native input stays focusable but hidden; the styled label below opens it. */}
        <div className="filepick">
          <input
            id="vs-file"
            className="visually-hidden"
            ref={fileRef}
            type="file"
            accept=".srt"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
          <label htmlFor="vs-file" className="button button--small filepick__button" aria-hidden="true">
            <FileUp className="icon" aria-hidden="true" />
            Choose .srt file
          </label>
          <span className={fileName ? 'filepick__name' : 'filepick__name muted'}>{fileName ?? 'No file chosen'}</span>
        </div>
      </div>
      <button className="button button--primary" type="submit" disabled={pending}>
        {pending ? 'Adding…' : 'Add Vietsub'}
      </button>
    </form>
  );
}
