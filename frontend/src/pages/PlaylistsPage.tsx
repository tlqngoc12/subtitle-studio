import { ListMusic, ListVideo, Pencil, Plus, Trash2 } from 'lucide-react';
import { SkeletonList } from '../components/ui/Skeleton';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ApiError, type FieldError } from '../api/client';
import {
  createPlaylist,
  deletePlaylist,
  listPlaylists,
  videoCountLabel,
  type PlaylistDetail,
  type PlaylistSummary,
} from '../api/playlists';
import { EmptyState } from '../components/EmptyState';
import { Tip } from '../components/Tip';
import { useConfirmDialog } from '../components/useConfirmDialog';
import { VietsubTabs } from '../components/VietsubTabs';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import { rowMotion } from '../lib/motion';
import { Alert } from '../components/ui/Alert';
import { PageHeader } from '../components/ui/PageHeader';
import './PlaylistsPage.css';

function toSummary(d: PlaylistDetail): PlaylistSummary {
  return {
    id: d.id,
    name: d.name,
    description: d.description,
    videoCount: d.videos.length,
    thumbnailUrl: d.videos[0]?.thumbnailUrl ?? null,
    updatedAt: d.updatedAt,
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Vietsub › Playlists: create, list and delete playlists (playlists spec section 5). */
export default function PlaylistsPage() {
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    listPlaylists()
      .then(setPlaylists)
      .catch((e) => {
        setPlaylists([]);
        setError(errorMessage(e));
      });
  }, []);

  async function handleDelete(p: PlaylistSummary) {
    const ok = await confirm({
      title: `Delete the playlist "${p.name}"?`,
      description: 'The videos and their Vietsub stay.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setBusyId(p.id);
    setError(null);
    try {
      await deletePlaylist(p.id);
      setPlaylists((list) => (list ?? []).filter((x) => x.id !== p.id));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="page">
      {confirmDialog}
      <PageHeader title="Vietsub" lede="Group videos with Vietsub into playlists and choose their order." />
      <VietsubTabs>
        <NewPlaylistForm onCreated={(d) => setPlaylists((list) => [toSummary(d), ...(list ?? [])])} />

        {error && (
          <Alert title={error.title} hint={error.hint} />
        )}

        <section className="history" aria-label="Playlists">
          <h2 className="history__heading">Playlists</h2>
          {playlists === null ? (
            <SkeletonList rows={4} />
          ) : playlists.length === 0 ? (
            <EmptyState icon={ListMusic}>
              No playlists yet. Create one above, then use Save to playlist in the Videos tab.
            </EmptyState>
          ) : (
            <ul className="history__list">
              <AnimatePresence initial={false}>
                {playlists.map((p) => (
                  <motion.li key={p.id} {...rowMotion} className="history__item" aria-busy={busyId === p.id}>
                    <Link className="history__open history__open--row" to={`/vietsub/playlists/${p.id}`}>
                      {p.thumbnailUrl ? (
                        <img src={p.thumbnailUrl} alt="" width={96} height={54} loading="lazy" />
                      ) : (
                        <span className="playlist-cover-empty" aria-hidden="true">
                          <ListVideo className="icon" />
                        </span>
                      )}
                      <span className="history__text">
                        <span className="history__title">{p.name}</span>
                        <span className="history__sub">
                          <span className="meta">{videoCountLabel(p.videoCount)}</span>
                          <span className="meta">Updated {formatDate(p.updatedAt)}</span>
                        </span>
                      </span>
                    </Link>
                    <span className="history__actions">
                      <Tip label="Edit playlist">
                        <Link
                          className="button button--icon button--s"
                          to={`/vietsub/playlists/${p.id}`}
                          aria-label={`Edit playlist: ${p.name}`}
                        >
                          <Pencil className="icon" aria-hidden="true" />
                        </Link>
                      </Tip>
                      <Tip label="Delete playlist">
                        <button
                          className="button button--icon button--s button--danger"
                          type="button"
                          disabled={busyId === p.id}
                          onClick={() => handleDelete(p)}
                          aria-label={`Delete playlist: ${p.name}`}
                        >
                          <Trash2 className="icon" aria-hidden="true" />
                        </button>
                      </Tip>
                    </span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>
      </VietsubTabs>
    </main>
  );
}

/** Name + optional description; server field errors are shown under their input. */
function NewPlaylistForm({ onCreated }: { onCreated: (d: PlaylistDetail) => void }) {
  const ids = useId();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const fieldError = (field: string) => fieldErrors.find((f) => f.field === field)?.message;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    setError(null);
    setFieldErrors([]);
    try {
      const created = await createPlaylist(name.trim(), description.trim() || undefined);
      onCreated(created);
      setName('');
      setDescription('');
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError) setFieldErrors(err.fieldErrors);
    } finally {
      setPending(false);
    }
  }

  const nameError = fieldError('name');
  const descriptionError = fieldError('description');
  return (
    <form className="vsform vsform--playlist" onSubmit={submit} aria-label="New playlist" aria-busy={pending}>
      <div className="vsform__field field">
        <label htmlFor={`${ids}-name`}>
          Name
        </label>
        <input
          id={`${ids}-name`}
          type="text"
          autoComplete="off"
          value={name}
          maxLength={100}
          required
          onChange={(e) => setName(e.target.value)}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? `${ids}-name-error` : undefined}
        />
        {nameError && (
          <p className="field__error" id={`${ids}-name-error`}>
            {nameError}
          </p>
        )}
      </div>
      <div className="vsform__field field">
        <label htmlFor={`${ids}-description`}>
          Description (optional)
        </label>
        <input
          id={`${ids}-description`}
          type="text"
          autoComplete="off"
          value={description}
          maxLength={1000}
          onChange={(e) => setDescription(e.target.value)}
          aria-invalid={descriptionError ? true : undefined}
          aria-describedby={descriptionError ? `${ids}-description-error` : undefined}
        />
        {descriptionError && (
          <p className="field__error" id={`${ids}-description-error`}>
            {descriptionError}
          </p>
        )}
      </div>
      <button className="button button--primary" type="submit" disabled={pending}>
        <Plus className="icon" aria-hidden="true" />
        {pending ? 'Creating…' : 'Create playlist'}
      </button>
      {error && (
        <Alert title={error.title} />
      )}
    </form>
  );
}
