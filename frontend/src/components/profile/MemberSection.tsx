import { Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
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
} from '../../api/profiles';
import { errorMessage, type ErrorMessage } from '../../lib/errors';
import { expandMotion, rowMotion } from '../../lib/motion';
import { Alert } from '../ui/Alert';
import { ImageLightbox } from '../ui/ImageLightbox';
import { useConfirmDialog } from '../useConfirmDialog';
import { BLOCK_TYPE_LABELS, BlockEditor } from './BlockEditor';
import { BlockToolbar } from './BlockToolbar';
import { BlockView } from './BlockView';
import { MemberHeaderEditor } from './MemberHeaderEditor';
import { MemberMenu } from './MemberMenu';
import { SocialIcons } from './SocialIcons';
import './MemberSection.css';

type OpenForm = { mode: 'edit'; id: number } | { mode: 'add'; type: BlockType } | null;

const TYPES = Object.keys(BLOCK_TYPE_LABELS) as BlockType[];

/** What the page gives a member section in edit mode. */
export interface MemberAdmin {
  isFirst: boolean;
  isLast: boolean;
  onMove: (direction: Direction) => void;
  onDelete: () => void;
}

/**
 * One member of the Profile page: portrait, name, tagline and social icons on one side, full name and the blocks
 * on the other. `side` is the side of the portrait; on narrow screens it stacks portrait first. LINKS blocks show
 * as icons under the portrait, so they are not repeated in the details. With `admin` (edit mode) the section also
 * has the member menu, the header form and the block tools; `onChange` receives the updated profile.
 */
export function MemberSection({
  profile,
  side,
  admin,
  onChange,
}: {
  profile: Profile;
  side: 'left' | 'right';
  admin?: MemberAdmin;
  onChange?: (profile: Profile) => void;
}) {
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [zoom, setZoom] = useState(false);
  const [headerOpen, setHeaderOpen] = useState(false);
  const [form, setForm] = useState<OpenForm>(null);
  const [choosingType, setChoosingType] = useState(false);
  const [actionError, setActionError] = useState<ErrorMessage | null>(null);

  const editing = admin !== undefined;
  const detailBlocks = profile.blocks.filter((b) => b.type !== 'LINKS');
  const firstFacts = detailBlocks.find((b) => b.type === 'FACTS');
  const nameId = `member-${profile.slug}-name`;
  // While editing, LINKS blocks are listed too: they have no other place to be edited.
  const shownBlocks = editing ? profile.blocks : detailBlocks;
  const formOpen = form !== null || headerOpen;

  const setBlocks = (update: (blocks: ProfileBlock[]) => ProfileBlock[]) =>
    onChange?.({ ...profile, blocks: update(profile.blocks) });

  async function run(action: () => Promise<void>) {
    setActionError(null);
    try {
      await action();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  const saveNew = async (input: BlockInput) => {
    const created = await addBlock(profile.slug, input);
    setBlocks((bs) => [...bs, created]);
    setForm(null);
  };

  const saveEdit = (id: number) => async (input: BlockInput) => {
    const updated = await updateBlock(profile.slug, id, input);
    setBlocks((bs) => bs.map((b) => (b.id === id ? updated : b)));
    setForm(null);
  };

  const remove = async (id: number) => {
    if (!(await confirm({ title: 'Delete this block?', confirmLabel: 'Delete', destructive: true }))) return;
    void run(async () => {
      await deleteBlock(profile.slug, id);
      setBlocks((bs) => bs.filter((b) => b.id !== id));
    });
  };

  const move = (id: number, direction: Direction) =>
    void run(async () => {
      const ordered = await moveBlock(profile.slug, id, direction);
      setBlocks(() => ordered);
    });

  return (
    <section id={profile.slug} className={`member member--${side}`} aria-labelledby={nameId}>
      {confirmDialog}
      <div className="member__aside">
        {profile.portraitUrl ? (
          <>
            <button type="button" className="member__portrait" aria-label={`View larger: ${profile.displayName}`} onClick={() => setZoom(true)}>
              <img src={profile.portraitUrl} alt={profile.displayName} />
            </button>
            <ImageLightbox
              images={[{ src: profile.portraitUrl, alt: profile.displayName }]}
              index={zoom ? 0 : null}
              onIndexChange={() => undefined}
              onClose={() => setZoom(false)}
            />
          </>
        ) : (
          <div className="member__portrait member__portrait--empty" aria-hidden="true">
            {profile.displayName.trim().charAt(0).toUpperCase()}
          </div>
        )}
        <div className="member__name-row">
          <h2 className="member__name" id={nameId}>
            {profile.displayName}
          </h2>
          {admin && (
            <MemberMenu
              name={profile.displayName}
              isFirst={admin.isFirst}
              isLast={admin.isLast}
              onEdit={() => setHeaderOpen(true)}
              onMove={admin.onMove}
              onDelete={admin.onDelete}
            />
          )}
        </div>
        {profile.tagline && <p className="member__tagline">{profile.tagline}</p>}
        <SocialIcons blocks={profile.blocks} />
      </div>

      <div className="member__details">
        {headerOpen && (
          <motion.div {...expandMotion}>
            <MemberHeaderEditor
              profile={profile}
              onSaved={(saved) => {
                onChange?.(saved);
                setHeaderOpen(false);
              }}
              onCancel={() => setHeaderOpen(false)}
            />
          </motion.div>
        )}
        {profile.fullName && <h3 className="member__full-name">{profile.fullName}</h3>}

        {actionError && <Alert title={actionError.title} hint={actionError.hint} />}

        <AnimatePresence initial={false}>
          {shownBlocks.map((b, i) => (
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
                      last={i === shownBlocks.length - 1}
                      disabled={formOpen}
                      onEdit={() => setForm({ mode: 'edit', id: b.id })}
                      onMove={(d) => move(b.id, d)}
                      onDelete={() => remove(b.id)}
                    />
                  )}
                  <BlockView block={b} plain hideTitle={!editing && b === firstFacts} />
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
              className="button button--s"
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
                    className="button button--s"
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
    </section>
  );
}
