import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowLeft, ArrowUp, GripVertical, ListPlus, Pencil, Play, Trash2, X } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ApiError, type FieldError, type VideoDto } from '../api/client';
import {
  deletePlaylist,
  getPlaylist,
  removeFromPlaylist,
  reorderPlaylist,
  updatePlaylist,
  videoCountLabel,
  type PlaylistDetail,
} from '../api/playlists';
import { EmptyState } from '../components/EmptyState';
import { Tip } from '../components/Tip';
import { useConfirmDialog } from '../components/useConfirmDialog';
import { VietsubTabs } from '../components/VietsubTabs';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import { Alert } from '../components/ui/Alert';
import { LoadingText } from '../components/ui/LoadingText';
import './PlaylistEditPage.css';

/** Vietsub › Playlists › one playlist: rename, reorder (drag and drop or ↑ ↓), remove videos, delete. */
export default function PlaylistEditPage() {
  const { playlistId = '' } = useParams();
  const id = Number(playlistId);
  const navigate = useNavigate();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [playlist, setPlaylist] = useState<PlaylistDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPlaylist(null);
    setNotFound(false);
    setError(null);
    getPlaylist(id)
      .then(setPlaylist)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        setError(errorMessage(e));
      });
  }, [id]);

  /** Shows the new order at once, then saves it; on failure puts the old order back (or reloads if stale). */
  async function saveOrder(next: VideoDto[]) {
    if (!playlist || saving) return;
    const previous = playlist;
    setPlaylist({ ...playlist, videos: next });
    setSaving(true);
    setError(null);
    try {
      await reorderPlaylist(id, next.map((v) => v.id));
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && e.code === 'INVALID_PLAYLIST_ORDER') {
        try {
          setPlaylist(await getPlaylist(id));
        } catch {
          setPlaylist(previous);
        }
      } else {
        setPlaylist(previous);
      }
    } finally {
      setSaving(false);
    }
  }

  function move(index: number, by: -1 | 1) {
    if (!playlist) return;
    void saveOrder(arrayMove(playlist.videos, index, index + by));
  }

  async function remove(video: VideoDto) {
    if (!playlist) return;
    setError(null);
    try {
      await removeFromPlaylist(id, video.id);
      setPlaylist((p) => (p ? { ...p, videos: p.videos.filter((v) => v.id !== video.id) } : p));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function handleDelete() {
    if (!playlist) return;
    const ok = await confirm({
      title: `Delete the playlist "${playlist.name}"?`,
      description: 'The videos and their Vietsub stay.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deletePlaylist(id);
      toast.success(`Playlist deleted: ${playlist.name}`);
      navigate('/vietsub/playlists');
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!playlist || !over || active.id === over.id) return;
    const from = playlist.videos.findIndex((v) => v.id === active.id);
    const to = playlist.videos.findIndex((v) => v.id === over.id);
    if (from < 0 || to < 0) return;
    void saveOrder(arrayMove(playlist.videos, from, to));
  }

  return (
    <main className="page">
      {confirmDialog}
      <VietsubTabs />
      <Link className="back-link" to="/vietsub/playlists">
        <ArrowLeft className="icon icon--sm" aria-hidden="true" />
        Back to Playlists
      </Link>

      {error && (
        <Alert title={error.title} hint={notFound ? undefined : error.hint} />
      )}

      {playlist && (
        <header className="masthead plhead">
          {editing ? (
            <DetailsForm
              playlist={playlist}
              onCancel={() => setEditing(false)}
              onSaved={(p) => {
                setPlaylist(p);
                setEditing(false);
              }}
            />
          ) : (
            <>
              <h1 className="masthead__name">{playlist.name}</h1>
              {playlist.description && <p className="masthead__lede">{playlist.description}</p>}
              <p className="muted">{videoCountLabel(playlist.videos.length)}</p>
              <div className="plhead__actions">
                {playlist.videos.length > 0 && (
                  <Link
                    className="button button--primary"
                    to={`/vietsub/${playlist.videos[0].id}?playlist=${playlist.id}`}
                    state={{ autoplay: true }}
                  >
                    <Play className="icon" aria-hidden="true" />
                    Play all
                  </Link>
                )}
                <button className="button" type="button" onClick={() => setEditing(true)}>
                  <Pencil className="icon" aria-hidden="true" />
                  Edit details
                </button>
              </div>
            </>
          )}
        </header>
      )}

      {!notFound && (
        <section className="history" aria-label="Videos in this playlist" aria-busy={saving}>
          <h2 className="history__heading">Videos</h2>
          {playlist === null ? (
            <LoadingText>Loading…</LoadingText>
          ) : playlist.videos.length === 0 ? (
            <EmptyState icon={ListPlus}>Use Save to playlist in the Videos tab to add videos.</EmptyState>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={playlist.videos.map((v) => v.id)} strategy={verticalListSortingStrategy}>
                <ol className="history__list plitems">
                  {playlist.videos.map((v, i) => (
                    <SortableRow
                      key={v.id}
                      video={v}
                      index={i}
                      count={playlist.videos.length}
                      disabled={saving}
                      onMove={(by) => move(i, by)}
                      onRemove={() => remove(v)}
                    />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
          )}
        </section>
      )}

      {/* Destructive, so kept away from Play all / Edit details. */}
      {playlist && !editing && (
        <div className="danger-zone">
          <button className="button button--danger" type="button" onClick={handleDelete}>
            <Trash2 className="icon" aria-hidden="true" />
            Delete playlist
          </button>
        </div>
      )}
    </main>
  );
}

interface RowProps {
  video: VideoDto;
  index: number;
  count: number;
  disabled: boolean;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}

function SortableRow({ video, index, count, disabled, onMove, onRemove }: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: video.id,
    disabled,
  });
  return (
    <li
      ref={setNodeRef}
      className={isDragging ? 'history__item plitem plitem--dragging' : 'history__item plitem'}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <span className="plitem__index">{index + 1}</span>
      <button
        ref={setActivatorNodeRef}
        className="button button--icon plitem__handle"
        type="button"
        aria-label={`Drag to reorder: ${video.title}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="icon" aria-hidden="true" />
      </button>
      <span className="history__open plitem__video">
        <img src={video.thumbnailUrl} alt="" width={96} height={54} loading="lazy" />
        <span className="history__text">
          <span className="history__title">{video.title}</span>
          {video.channel && <span className="history__sub">{video.channel}</span>}
        </span>
      </span>
      <span className="history__actions">
        <Tip label="Move up">
          <button
            className="button button--icon"
            type="button"
            disabled={disabled || index === 0}
            onClick={() => onMove(-1)}
            aria-label={`Move up: ${video.title}`}
          >
            <ArrowUp className="icon" aria-hidden="true" />
          </button>
        </Tip>
        <Tip label="Move down">
          <button
            className="button button--icon"
            type="button"
            disabled={disabled || index === count - 1}
            onClick={() => onMove(1)}
            aria-label={`Move down: ${video.title}`}
          >
            <ArrowDown className="icon" aria-hidden="true" />
          </button>
        </Tip>
        <Tip label="Remove from playlist">
          <button
            className="button button--icon button--danger"
            type="button"
            disabled={disabled}
            onClick={onRemove}
            aria-label={`Remove from playlist: ${video.title}`}
          >
            <X className="icon" aria-hidden="true" />
          </button>
        </Tip>
      </span>
    </li>
  );
}

/** Edits name and description; sends only the fields that changed. */
function DetailsForm({
  playlist,
  onCancel,
  onSaved,
}: {
  playlist: PlaylistDetail;
  onCancel: () => void;
  onSaved: (p: PlaylistDetail) => void;
}) {
  const ids = useId();
  const [name, setName] = useState(playlist.name);
  const [description, setDescription] = useState(playlist.description ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const fieldError = (field: string) => fieldErrors.find((f) => f.field === field)?.message;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const patch: { name?: string; description?: string } = {};
    if (name.trim() !== playlist.name) patch.name = name.trim();
    if (description.trim() !== (playlist.description ?? '')) patch.description = description.trim();
    if (Object.keys(patch).length === 0) {
      onCancel();
      return;
    }
    setPending(true);
    setError(null);
    setFieldErrors([]);
    try {
      onSaved(await updatePlaylist(playlist.id, patch));
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError) setFieldErrors(err.fieldErrors);
      setPending(false);
    }
  }

  const nameError = fieldError('name');
  const descriptionError = fieldError('description');
  return (
    <form className="vsform vsform--playlist" onSubmit={submit} aria-label="Playlist details" aria-busy={pending}>
      <div className="vsform__field field">
        <label htmlFor={`${ids}-name`}>Name</label>
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
        <label htmlFor={`${ids}-description`}>Description (optional)</label>
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
      <span className="plhead__form-actions">
        <button className="button button--primary" type="submit" disabled={pending}>
          Save
        </button>
        <button className="button" type="button" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
      </span>
      {error && (
        <Alert title={error.title} />
      )}
    </form>
  );
}
