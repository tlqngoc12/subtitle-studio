import { ListMusic, ListVideo, Pencil, Plus, Trash2 } from 'lucide-react';
import { SkeletonList } from '../components/ui/Skeleton';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  deletePlaylist,
  listPlaylists,
  videoCountLabel,
  type PlaylistDetail,
  type PlaylistSummary,
} from '../api/playlists';
import { CreatePlaylistDialog } from '../components/CreatePlaylistDialog';
import { EmptyState } from '../components/EmptyState';
import { Tip } from '../components/Tip';
import { useConfirmDialog } from '../components/useConfirmDialog';
import { VietsubTabs } from '../components/VietsubTabs';
import { formatInstant } from '../lib/dates';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import { rowMotion } from '../lib/motion';
import { Alert } from '../components/ui/Alert';
import { Page } from '../components/ui/Page';
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


/** Vietsub › Playlists: create, list and delete playlists (playlists spec section 5). */
export default function PlaylistsPage() {
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

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
    <Page>
      {confirmDialog}
      <PageHeader
        title="Vietsub"
        lede="Group videos with Vietsub into playlists and choose their order."
        actions={
          <button className="button button--primary" type="button" onClick={() => setCreating(true)}>
            <Plus className="icon" aria-hidden="true" />
            Create playlist
          </button>
        }
      />
      <CreatePlaylistDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(d) => {
          setPlaylists((list) => [toSummary(d), ...(list ?? [])]);
          setCreating(false);
        }}
      />
      <VietsubTabs>
        {error && (
          <Alert title={error.title} hint={error.hint} />
        )}

        <section className="history" aria-label="Playlists">
          <h2 className="history__heading">Playlists</h2>
          {playlists === null ? (
            <SkeletonList rows={4} />
          ) : playlists.length === 0 ? (
            <EmptyState icon={ListMusic}>
              No playlists yet. Choose Create playlist to add one.
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
                          <span className="meta">Updated {formatInstant(p.updatedAt)}</span>
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
    </Page>
  );
}
