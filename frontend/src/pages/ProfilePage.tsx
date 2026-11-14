import { useT } from '../lib/i18n';
import * as Popover from '@radix-ui/react-popover';
import { Check, Pencil, Sparkles, SquarePlus, UserPlus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useParams } from 'react-router';
import { toast } from 'sonner';
import {
  addMember,
  deleteMember,
  reorderMembers,
  type BannerImage,
  type Direction,
  type Profile,
  type ProfilePage as ProfilePageData,
} from '../api/profiles';
import { EmptyState } from '../components/EmptyState';
import { BannerEditor } from '../components/profile/BannerEditor';
import { MemberHeaderEditor } from '../components/profile/MemberHeaderEditor';
import { MemberSection } from '../components/profile/MemberSection';
import { ProfileBanner } from '../components/profile/ProfileBanner';
import { Alert } from '../components/ui/Alert';
import { LoadingText } from '../components/ui/LoadingText';
import { Page } from '../components/ui/Page';
import { PageHeader } from '../components/ui/PageHeader';
import { PopoverPanel } from '../components/ui/PopoverPanel';
import { Reveal } from '../components/ui/Reveal';
import { useConfirmDialog } from '../components/useConfirmDialog';
import { useSite } from '../data/SiteContext';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import './ProfilePage.css';

/** Old links /profiles/:slug keep working: they open the one page at that member's section. */
export function ProfileRedirect() {
  const { slug = '' } = useParams();
  return <Navigate to={slug === 'emibonnie' || slug === '' ? '/profiles' : `/profiles#${slug}`} replace />;
}

/** Profile page (/profiles): the EmiBonnie banner, then one section per member with alternating portrait sides. */
export default function ProfilePage() {
  const { source, readOnly } = useSite();
  const { hash } = useLocation();
  const t = useT();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [data, setData] = useState<ProfilePageData | null>(null);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [actionError, setActionError] = useState<ErrorMessage | null>(null);
  const [editing, setEditing] = useState(false);
  const [groupHeaderOpen, setGroupHeaderOpen] = useState(false);
  const [scrollTo, setScrollTo] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setData(null);
    setError(null);
    source
      .getProfilePage()
      .then((p) => current && setData(p))
      .catch((e) => current && setError(errorMessage(e, { readOnly })));
    return () => {
      current = false;
    };
  }, [source, readOnly]);

  // Scroll to #slug once the sections exist; an unknown hash is ignored.
  useEffect(() => {
    if (!data || !hash) return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView?.({ block: 'start' });
  }, [data, hash]);

  // A member that was just added scrolls into view once its section is rendered.
  useEffect(() => {
    if (!scrollTo || !data) return;
    document.getElementById(scrollTo)?.scrollIntoView?.({ block: 'start' });
    setScrollTo(null);
  }, [scrollTo, data]);

  const setMembers = (update: (members: Profile[]) => Profile[]) =>
    setData((d) => (d ? { ...d, members: update(d.members) } : d));
  const replaceMember = (profile: Profile) =>
    setMembers((ms) => ms.map((m) => (m.slug === profile.slug ? profile : m)));
  const setBanner = (banner: BannerImage[]) =>
    setData((d) => (d ? { ...d, group: { ...d.group, banner } } : d));

  async function run(action: () => Promise<void>) {
    setActionError(null);
    try {
      await action();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  const moveMember = (slug: string, direction: Direction) =>
    run(async () => {
      if (!data) return;
      const slugs = data.members.map((m) => m.slug);
      const i = slugs.indexOf(slug);
      const j = direction === 'UP' ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= slugs.length) return;
      [slugs[i], slugs[j]] = [slugs[j], slugs[i]];
      const ordered = await reorderMembers(slugs);
      setMembers(() => ordered);
    });

  const removeMember = async (member: Profile) => {
    const ok = await confirm({
      title: `Delete ${member.displayName}?`,
      description: 'Their blocks and banner are removed.',
      confirmLabel: 'Delete member',
      destructive: true,
    });
    if (!ok) return;
    void run(async () => {
      await deleteMember(member.slug);
      setMembers((ms) => ms.filter((m) => m.slug !== member.slug));
      toast.success('Member deleted', { description: member.displayName });
    });
  };

  const created = (member: Profile) => {
    setMembers((ms) => [...ms, member]);
    setEditing(true);
    setScrollTo(member.slug);
  };

  // Data published before the banner existed has no `banner` field.
  const banner = data?.group?.banner ?? [];
  const admin = !readOnly;

  return (
    <Page>
      {confirmDialog}
      <PageHeader
        title={t('Profile', 'Hồ sơ')}
        actions={
          admin && (
            <div className="pmasthead">
              <AddMember onCreated={created} />
              {editing ? (
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => {
                    setEditing(false);
                    setGroupHeaderOpen(false);
                  }}
                >
                  <Check className="icon" aria-hidden="true" />
                  Done
                </button>
              ) : (
                <button type="button" className="button" onClick={() => setEditing(true)}>
                  <Pencil className="icon" aria-hidden="true" />
                  Edit
                </button>
              )}
            </div>
          )
        }
      />

      {error && <Alert title={error.title} hint={error.hint} />}
      {actionError && <Alert title={actionError.title} hint={actionError.hint} />}
      {data === null && !error && <LoadingText>{t('Loading profile…', 'Đang tải hồ sơ…')}</LoadingText>}

      {data && (
        <>
          <Reveal>
            <ProfileBanner images={banner} />
          </Reveal>
          {editing && admin && (
            <div className="pgroup">
              <BannerEditor slug={data.group.slug} images={banner} onChange={setBanner} />
              {groupHeaderOpen ? (
                <MemberHeaderEditor
                  profile={data.group}
                  onSaved={(saved) => {
                    setData((d) => (d ? { ...d, group: { ...saved, banner: d.group.banner } } : d));
                    setGroupHeaderOpen(false);
                  }}
                  onCancel={() => setGroupHeaderOpen(false)}
                />
              ) : (
                <button type="button" className="button button--s" onClick={() => setGroupHeaderOpen(true)}>
                  <Pencil className="icon" aria-hidden="true" />
                  Edit EmiBonnie avatar
                </button>
              )}
            </div>
          )}

          {data.members.length === 0 ? (
            admin ? (
              <EmptyState icon={SquarePlus}>No members yet. Choose Add member to add the first one.</EmptyState>
            ) : (
              <EmptyState icon={Sparkles}>{t('Nothing here yet — check back soon.', 'Chưa có gì ở đây, hãy quay lại sau nhé.')}</EmptyState>
            )
          ) : (
            <div className="pmembers">
              {data.members.map((m, i) => (
                <MemberSection
                  key={m.slug}
                  profile={m}
                  side={i % 2 === 0 ? 'left' : 'right'}
                  onChange={replaceMember}
                  admin={
                    editing && admin
                      ? {
                          isFirst: i === 0,
                          isLast: i === data.members.length - 1,
                          onMove: (d) => void moveMember(m.slug, d),
                          onDelete: () => void removeMember(m),
                        }
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </>
      )}
    </Page>
  );
}

/** "Add member": a small popover asking for the name; the server makes the slug. */
function AddMember({ onCreated }: { onCreated: (member: Profile) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    // This form lives in a portal; React still bubbles its submit to a form around the trigger (the work editor).
    e.stopPropagation();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const member = await addMember(name.trim());
      setOpen(false);
      setName('');
      onCreated(member);
    } catch (err) {
      setError(errorMessage(err).title);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" className="button">
          <UserPlus className="icon" aria-hidden="true" />
          Add member
        </button>
      </Popover.Trigger>
      <PopoverPanel className="add-member">
        <form className="add-member__form" onSubmit={submit}>
          <label htmlFor="add-member-name">Member name</label>
          <input id="add-member-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
          {error && (
            <p className="field__error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="button button--primary" disabled={saving || !name.trim()}>
            Add
          </button>
        </form>
      </PopoverPanel>
    </Popover.Root>
  );
}
