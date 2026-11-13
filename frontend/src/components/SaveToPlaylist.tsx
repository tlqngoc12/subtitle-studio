import * as Popover from '@radix-ui/react-popover';
import { ListMusic, ListPlus, Plus } from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import type { VideoDto } from '../api/client';
import {
  addToPlaylist,
  createPlaylist,
  listPlaylists,
  removeFromPlaylist,
  type PlaylistSummary,
} from '../api/playlists';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import { EmptyState } from './EmptyState';
import { Tip } from './Tip';
import { Alert } from './ui/Alert';
import { LoadingText } from './ui/LoadingText';
import { PopoverPanel } from './ui/PopoverPanel';
import './SaveToPlaylist.css';

/**
 * "Save to playlist" like YouTube: an icon button opening a popover with one checkbox per playlist. Ticking adds
 * the video at the end, unticking removes it; both save at once. "New playlist" creates one and adds the video.
 */
export function SaveToPlaylist({ video }: { video: VideoDto }) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<ErrorMessage | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setPlaylists(null);
    setError(null);
    listPlaylists(video.id)
      .then(setPlaylists)
      .catch((e) => {
        setPlaylists([]);
        setError(errorMessage(e));
      });
  }

  function setContains(id: number, contains: boolean) {
    setPlaylists((list) => (list ?? []).map((p) => (p.id === id ? { ...p, containsVideo: contains } : p)));
  }

  async function toggle(p: PlaylistSummary) {
    if (savingId !== null) return;
    const add = !p.containsVideo;
    setSavingId(p.id);
    setError(null);
    setContains(p.id, add);
    try {
      if (add) {
        await addToPlaylist(p.id, video.id);
        toast.success(`Saved to ${p.name}`);
      } else {
        await removeFromPlaylist(p.id, video.id);
        toast.success(`Removed from ${p.name}`);
      }
    } catch (e) {
      setContains(p.id, !add);
      setError(errorMessage(e));
    } finally {
      setSavingId(null);
    }
  }

  async function create() {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createPlaylist(name);
      const withVideo = await addToPlaylist(created.id, video.id);
      setPlaylists((list) => [
        ...(list ?? []),
        {
          id: withVideo.id,
          name: withVideo.name,
          description: withVideo.description,
          videoCount: withVideo.videos.length,
          thumbnailUrl: withVideo.videos[0]?.thumbnailUrl ?? null,
          updatedAt: withVideo.updatedAt,
          containsVideo: true,
        },
      ]);
      setNewName('');
      toast.success(`Saved to ${withVideo.name}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCreating(false);
    }
  }

  function onNewNameKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void create();
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Tip label="Save to playlist">
        <Popover.Trigger asChild>
          <button className="button button--icon button--s" type="button" aria-label={`Save to playlist: ${video.title}`}>
            <ListPlus className="icon" aria-hidden="true" />
          </button>
        </Popover.Trigger>
      </Tip>
      <PopoverPanel className="saveto" aria-labelledby={`${ids}-title`}>
        <p className="saveto__title" id={`${ids}-title`}>
          Save to playlist
        </p>
        {playlists === null ? (
          <LoadingText>Loading playlists…</LoadingText>
        ) : playlists.length === 0 ? (
          <EmptyState icon={ListMusic} compact>
            No playlists yet. Create one in Vietsub &gt; Playlists.
          </EmptyState>
        ) : (
          <ul className="saveto__list">
            {playlists.map((p) => (
              <li key={p.id}>
                <label className="saveto__option">
                  <input
                    type="checkbox"
                    checked={p.containsVideo === true}
                    disabled={savingId === p.id}
                    onChange={() => toggle(p)}
                  />
                  <span>{p.name}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {error && <Alert className="saveto__alert" title={error.title} />}
        <div className="saveto__new">
          <Plus className="icon icon--sm" aria-hidden="true" />
          <input
            type="text"
            className="saveto__input"
            placeholder="New playlist"
            aria-label="New playlist name"
            maxLength={100}
            value={newName}
            disabled={creating}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={onNewNameKey}
          />
        </div>
      </PopoverPanel>
    </Popover.Root>
  );
}
