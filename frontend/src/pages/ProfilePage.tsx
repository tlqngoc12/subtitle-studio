import { Check, Pencil, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError } from '../api/client';
import {
  addBlock,
  deleteBlock,
  getProfile,
  listProfiles,
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
import { ProfileTabs } from '../components/profile/ProfileTabs';
import { errorMessage, type ErrorMessage } from '../lib/errors';

type OpenForm = { mode: 'edit'; id: number } | { mode: 'add'; type: BlockType } | null;

const TYPES = Object.keys(BLOCK_TYPE_LABELS) as BlockType[];

/** Profile page (/profiles/:slug): name, tabs and the blocks in order; "Chỉnh sửa" edits them in place. */
export default function ProfilePage() {
  const { slug = 'emibonnie' } = useParams();
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<{ message: ErrorMessage; notFound: boolean } | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<OpenForm>(null);
  const [choosingType, setChoosingType] = useState(false);
  const [actionError, setActionError] = useState<ErrorMessage | null>(null);

  useEffect(() => {
    listProfiles()
      .then(setProfiles)
      .catch(() => setProfiles([]));
  }, []);

  useEffect(() => {
    let current = true;
    setProfile(null);
    setError(null);
    setForm(null);
    setChoosingType(false);
    setActionError(null);
    getProfile(slug)
      .then((p) => current && setProfile(p))
      .catch((e) => {
        if (!current) return;
        const notFound = e instanceof ApiError && e.code === 'PROFILE_NOT_FOUND';
        setError({ message: errorMessage(e), notFound });
      });
    return () => {
      current = false;
    };
  }, [slug]);

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

  const remove = (id: number) => {
    if (!window.confirm('Xóa khối này?')) return;
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
      <ProfileTabs profiles={profiles} current={slug} />

      {error && (
        <div className="alert" role="alert">
          <p className="alert__title">{error.message.title}</p>
          {error.message.hint && <p className="alert__hint">{error.message.hint}</p>}
          {error.notFound && <Link to="/profiles/emibonnie">Về EmiBonnie</Link>}
        </div>
      )}

      {profile === null && !error && <p className="muted">Đang tải profile…</p>}

      {profile && (
        <>
          <header className="masthead pmasthead">
            <h1 className="masthead__name">{profile.displayName}</h1>
            {editing ? (
              <button type="button" className="button button--primary" onClick={stopEditing}>
                <Check className="icon" aria-hidden="true" />
                Xong
              </button>
            ) : (
              <button type="button" className="button button--small" onClick={() => setEditing(true)}>
                <Pencil className="icon" aria-hidden="true" />
                Chỉnh sửa
              </button>
            )}
          </header>

          {actionError && (
            <div className="alert" role="alert">
              <p className="alert__title">{actionError.title}</p>
              {actionError.hint && <p className="alert__hint">{actionError.hint}</p>}
            </div>
          )}

          <div className="pblocks">
            {profile.blocks.length === 0 && !formOpen && <p className="muted">Profile này chưa có nội dung.</p>}
            {profile.blocks.map((b, i) =>
              form?.mode === 'edit' && form.id === b.id ? (
                <BlockEditor
                  key={b.id}
                  type={b.type}
                  initial={b}
                  onSave={saveEdit(b.id)}
                  onCancel={() => setForm(null)}
                />
              ) : (
                <div key={b.id} className="pblock-wrap">
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
                </div>
              ),
            )}

            {form?.mode === 'add' && (
              <BlockEditor type={form.type} onSave={saveNew} onCancel={() => setForm(null)} />
            )}

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
                  Thêm khối
                </button>
                {choosingType && !formOpen && (
                  <div className="padd__types" role="group" aria-label="Chọn loại khối">
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
    </main>
  );
}
