import * as Popover from '@radix-ui/react-popover';
import { Ellipsis, Star, StarOff } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { setNovelFeatured, type NovelSummary } from '../../api/novels';
import { errorMessage } from '../../lib/errors';
import { useConfirmDialog } from '../useConfirmDialog';
import { PopoverPanel } from '../ui/PopoverPanel';
import '../profile/MemberMenu.css';
import '../fanfics/FanficMenu.css';

export const MAX_BANNER = 5;

/**
 * The admin `⋯` menu in the corner of a novel card: Add to / Remove from the public banner (at most 5 novels).
 * With 5 already picked, adding shows an alert and calls no API (the server would answer 409 BANNER_FULL anyway).
 */
export function NovelMenu({
  novel,
  pickedCount,
  onChange,
}: {
  novel: NovelSummary;
  /** How many novels are on the banner now. */
  pickedCount: number;
  onChange: (updated: NovelSummary) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirmDialog();

  async function toggle() {
    setOpen(false);
    const next = !novel.featured;
    if (next && pickedCount >= MAX_BANNER) {
      await confirm({
        alertOnly: true,
        title: 'Banner is full',
        description: 'The banner already has 5 novels. Remove one before adding another.',
        confirmLabel: 'OK',
      });
      return;
    }
    setBusy(true);
    try {
      onChange(await setNovelFeatured(novel.id, next));
      toast.success(next ? 'Added to banner' : 'Removed from banner');
    } catch (e) {
      const m = errorMessage(e);
      toast.error(m.hint ? `${m.title} ${m.hint}` : m.title);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fanfic-menu">
      {dialog}
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="button button--icon button--s"
            aria-label={`Menu for ${novel.title}`}
            aria-busy={busy || undefined}
          >
            <Ellipsis className="icon" aria-hidden="true" />
          </button>
        </Popover.Trigger>
        <PopoverPanel className="member-menu">
          <div className="member-menu__list">
            <button type="button" className="member-menu__item" disabled={busy} onClick={() => void toggle()}>
              {novel.featured ? (
                <StarOff className="icon" aria-hidden="true" />
              ) : (
                <Star className="icon" aria-hidden="true" />
              )}
              {novel.featured ? 'Remove from banner' : 'Add to banner'}
            </button>
          </div>
        </PopoverPanel>
      </Popover.Root>
    </div>
  );
}
