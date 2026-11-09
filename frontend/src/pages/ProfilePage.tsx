import { useConfirmDialog } from '../components/useConfirmDialog';
import { Check, Pencil, Plus, Sparkles, SquarePlus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError } from '../api/client';
import {
  addBlock,
  deleteBlock,
  moveBlock,
  updateBlock,
  type BlockInput,
  type BlockType,
  type Direction,
  type Profile,
  type ProfileBlock,
  type ProfileSummary,
} from '../api/profiles';
import { BLOCK_TYPE_LABELS, BlockEditor } from '../components/profile/BlockEditor';
import { BlockToolbar } from '../components/profile/BlockToolbar';
import { BlockView } from '../components/profile/BlockView';
import { EmptyState } from '../components/EmptyState';
import { ProfileTabs } from '../components/profile/ProfileTabs';
import { useSite } from '../data/SiteContext';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import { expandMotion, rowMotion } from '../lib/motion';
import { Alert } from '../components/ui/Alert';
import { LoadingText } from '../components/ui/LoadingText';
import './ProfilePage.css';

type OpenForm = { mode: 'edit'; id: number } | { mode: 'add'; type: BlockType } | null;

const TYPES = Object.keys(BLOCK_TYPE_LABELS) as BlockType[];

/** Profile page (/profiles/:slug): name, tabs and the blocks in order; "Edit" edits them in place. */
export default function ProfilePage() {
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { slug = 'emibonnie' } = useParams();
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<{ message: ErrorMessage; notFound: boolean } | null>(null);
  const { source, readOnly } = useSite();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<OpenForm>(null);
  const [choosingType, setChoosingType] = useState(false);
  const [actionError, setActionError] = useState<ErrorMessage | null>(null);

  useEffect(() => {
    source
      .listProfiles()
      .then(setProfiles)
      .catch(() => setProfiles([]));
  }, [source]);

  useEffect(() => {
    let current = true;
    setProfile(null);
    setError(null);
    setForm(null);
    setChoosingType(false);
    setActionError(null);
    source
      .getProfile(slug)
      .then((p) => current && setProfile(p))
      .catch((e) => {
        if (!current) return;
        const notFound = e instanceof ApiError && e.code === 'PROFILE_NOT_FOUND';
        setError({ message: errorMessage(e, { readOnly }), notFound });
      });
    return () => {
      current = false;
    };
  }, [slug, source, readOnly]);

  const setBlocks = (update: (blocks: ProfileBlock[]) => ProfileBlock[]) =>
    setProfile((p) => (p ? { ...p, blocks: update(p.blocks) } : p));

  async function run(action: () => Promise<void>) {
    setActionError(null);
    try {
      await action();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  const saveNew = async (input: BlockInput) => {
    const created = await addBlock(slug, input);
    setBlocks((bs) => [...bs, created]);
    setForm(null);
  };

  const saveEdit = (id: number) => async (input: BlockInput) => {
    const updated = await updateBlock(slug, id, input);
    setBlocks((bs) => bs.map((b) => (b.id === id ? updated : b)));
    setForm(null);
  };

  const remove = async (id: number) => {
    if (!(await confirm({ title: 'Delete this block?', confirmLabel: 'Delete', destructive: true }))) return;
    void run(async () => {
      await deleteBlock(slug, id);
      setBlocks((bs) => bs.filter((b) => b.id !== id));
    });
  };

  const move = (id: number, direction: Direction) =>
    void run(async () => {
      const ordered = await moveBlock(slug, id, direction);
      setBlocks(() => ordered);
    });

  const stopEditing = () => {
    setEditing(false);
    setForm(null);
    setChoosingType(false);
  };

  const formOpen = form !== null;

  return (
    <main className="page">
      {confirmDialog}
      <ProfileTabs profiles={profiles} current={slug}>
        {error && (
          <Alert title={error.message.title} hint={error.message.hint}>
            {error.notFound && <Link to="/profiles/emibonnie">Back to EmiBonnie</Link>}
          </Alert>
        )}

        {profile === null && !error && <LoadingText>Loading profile…</LoadingText>}

        {profile && (
          <>
            <header className="masthead pmasthead">
              <h1 className="masthead__name">{profile.displayName}</h1>
              {readOnly ? null : editing ? (
                <button type="button" className="button button--primary" onClick={stopEditing}>
                  <Check className="icon" aria-hidden="true" />
                  Done
                </button>
              ) : (
                <button type="button" className="button button--small" onClick={() => setEditing(true)}>
                  <Pencil className="icon" aria-hidden="true" />
                  Edit
                </button>
              )}
            </header>

            {actionError && (
              <Alert title={actionError.title} hint={actionError.hint} />
            )}

            <div className="pblocks">
              {profile.blocks.length === 0 && !formOpen && (
                readOnly ? (
                  <EmptyState icon={Sparkles}>Nothing here yet — check back soon.</EmptyState>
                ) : (
                  <EmptyState icon={SquarePlus}>
                    This profile has no content yet.{editing ? ' Use Add block below to start.' : ' Choose Edit to add the first block.'}
                  </EmptyState>
                )
              )}
              <AnimatePresence initial={false}>
                {profile.blocks.map((b, i) => (
                  // One motion wrapper per block: it glides on Move up/down and collapses on Delete.
                  <motion.div key={b.id} className="pblock-wrap" {...rowMotion}>
                    {form?.mode === 'edit' && form.id === b.id ? (
                      <motion.div {...expandMotion}>
                        <BlockEditor type={b.type} initial={b} onSave={saveEdit(b.id)} onCancel={() => setForm(null)} />
                      </motion.div>
                    ) : (
                      <>
                        {editing && (
                          <BlockToolbar
                            first={i === 0}
                            last={i === profile.blocks.length - 1}
                            disabled={formOpen}
                            onEdit={() => setForm({ mode: 'edit', id: b.id })}
                            onMove={(d) => move(b.id, d)}
                            onDelete={() => remove(b.id)}
                          />
                        )}
                        <BlockView block={b} />
                      </>
                    )}
                  </motion.div>
                ))}

                {form?.mode === 'add' && (
                  <motion.div key="new-block" {...expandMotion}>
                    <BlockEditor type={form.type} onSave={saveNew} onCancel={() => setForm(null)} />
                  </motion.div>
                )}
              </AnimatePresence>

              {editing && (
                <div className="padd">
                  <button
                    type="button"
                    className="button button--small"
                    aria-expanded={choosingType}
                    disabled={formOpen}
                    onClick={() => setChoosingType((v) => !v)}
                  >
                    <Plus className="icon" aria-hidden="true" />
                    Add block
                  </button>
                  {choosingType && !formOpen && (
                    <div className="padd__types" role="group" aria-label="Choose block type">
                      {TYPES.map((t) => (
                        <button
                          key={t}
                          type="button"
                          className="button button--small"
                          onClick={() => {
                            setChoosingType(false);
                            setForm({ mode: 'add', type: t });
                          }}
                        >
                          {BLOCK_TYPE_LABELS[t]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </ProfileTabs>
    </main>
  );
}
