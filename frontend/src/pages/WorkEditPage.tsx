import { ArrowLeft, Trash2 } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ApiError, type FieldError } from '../api/client';
import { getProfilePage, type ProfilePage } from '../api/profiles';
import {
  createWork,
  deleteWork,
  getWork,
  listWorks,
  updateWork,
  type Work,
  type WorkCategory,
  type WorkInput,
  type WorkSummary,
} from '../api/works';
import { CATEGORIES, CATEGORY_LABELS } from '../components/works/categories';
import { CreditsEditor, type CreditRow } from '../components/works/CreditsEditor';
import { LinksEditor, type LinkRow } from '../components/works/LinksEditor';
import { ImagePicker, type PickedImage } from '../components/profile/ImagePicker';
import { Alert } from '../components/ui/Alert';
import { LoadingText } from '../components/ui/LoadingText';
import { PageHeader } from '../components/ui/PageHeader';
import { Select } from '../components/ui/Select';
import { useConfirmDialog } from '../components/useConfirmDialog';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import './WorkEditPage.css';

const blankToNull = (s: string) => (s.trim() === '' ? null : s.trim());

/** Add or edit a work (`/works/new`, `/works/:id/edit`): cover, details, links and people. */
export default function WorkEditPage() {
  const { id: raw } = useParams();
  const id = raw === undefined ? null : /^[1-9]\d*$/.test(raw) ? Number(raw) : NaN;
  const navigate = useNavigate();
  const idPrefix = useId();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const nextKey = useRef(0);
  const newKey = () => nextKey.current++;

  const [loaded, setLoaded] = useState(id === null);
  const [notFound, setNotFound] = useState(Number.isNaN(id));
  const [title, setTitle] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [category, setCategory] = useState<WorkCategory>('FILM_TV');
  const [subcategory, setSubcategory] = useState('');
  const [profile, setProfile] = useState('');
  const [description, setDescription] = useState('');
  const [cover, setCover] = useState<PickedImage | null>(null);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [credits, setCredits] = useState<CreditRow[]>([]);
  const [profiles, setProfiles] = useState<ProfilePage | null>(null);
  const [allWorks, setAllWorks] = useState<WorkSummary[]>([]);
  const [uploads, setUploads] = useState(0);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<ErrorMessage | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const errorOf = (field: string) => fieldErrors.find((e) => e.field === field)?.message;

  useEffect(() => {
    getProfilePage().then(setProfiles).catch(() => undefined);
    listWorks().then(setAllWorks).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (id === null || Number.isNaN(id)) return;
    let current = true;
    getWork(id)
      .then((w: Work) => {
        if (!current) return;
        setTitle(w.title);
        setReleaseDate(w.releaseDate ?? '');
        setCategory(w.category);
        setSubcategory(w.subcategory ?? '');
        setProfile(w.profile ?? '');
        setDescription(w.description ?? '');
        setCover(w.coverMediaId != null && w.coverUrl ? { mediaId: w.coverMediaId, mediaUrl: w.coverUrl } : null);
        setLinks(
          w.links.map((l) => ({ key: newKey(), kind: l.kind, label: l.label, url: l.url, icon: l.icon ?? '' })),
        );
        setCredits(
          w.credits.map((c) => ({
            key: newKey(),
            person: c.person,
            role: c.role ?? '',
            characterName: c.characterName ?? '',
          })),
        );
        setLoaded(true);
      })
      .catch((e) => {
        if (!current) return;
        if (e instanceof ApiError && e.code === 'WORK_NOT_FOUND') setNotFound(true);
        else setFormError(errorMessage(e));
        setLoaded(true);
      });
    return () => {
      current = false;
    };
  }, [id]);

  const suggestions = useMemo(
    () => [...new Set(allWorks.filter((w) => w.category === category && w.subcategory).map((w) => w.subcategory as string))],
    [allWorks, category],
  );

  const input = (): WorkInput => ({
    title: title.trim(),
    coverMediaId: cover?.mediaId ?? null,
    releaseDate: releaseDate === '' ? null : releaseDate,
    category,
    subcategory: blankToNull(subcategory),
    profile: profile === '' ? null : profile,
    description: blankToNull(description),
    links: links.map((l) => ({ kind: l.kind, label: l.label.trim(), url: l.url.trim(), icon: l.icon === '' ? null : l.icon })),
    credits: credits.map((c) => ({
      personId: c.person.id,
      role: blankToNull(c.role),
      characterName: category === 'FILM_TV' ? blankToNull(c.characterName) : null,
    })),
  });

  async function save() {
    if (saving || uploads > 0) return;
    setSaving(true);
    setFormError(null);
    setFieldErrors([]);
    try {
      const saved = id === null ? await createWork(input()) : await updateWork(id, input());
      toast.success('Work saved');
      navigate(`/works/${saved.id}`);
    } catch (err) {
      setFormError(errorMessage(err));
      setFieldErrors(err instanceof ApiError ? err.fieldErrors : []);
      setSaving(false);
    }
  }

  // Ctrl+S saves like the Save button.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  async function remove() {
    if (id === null || Number.isNaN(id)) return;
    const ok = await confirm({ title: `Delete “${title}”?`, confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    try {
      await deleteWork(id);
      toast.success('Work deleted');
      navigate('/works');
    } catch (e) {
      setFormError(errorMessage(e));
    }
  }

  const back = (
    <Link className="back-link" to={id === null || Number.isNaN(id) ? '/works' : `/works/${id}`}>
      <ArrowLeft className="icon" aria-hidden="true" />
      {id === null || Number.isNaN(id) ? 'Back to Works' : 'Back to the work'}
    </Link>
  );

  if (notFound) {
    return (
      <main className="page">
        <PageHeader title="Work not found" lede={<Link to="/works">Back to Works</Link>} />
      </main>
    );
  }

  const profileOptions = [
    { value: '', label: 'None' },
    ...(profiles ? [profiles.group, ...profiles.members] : []).map((p) => ({ value: p.slug, label: p.displayName })),
  ];

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void save();
  }

  return (
    <main className="page">
      {confirmDialog}
      {back}
      <PageHeader title={id === null ? 'Add work' : 'Edit work'} />
      {formError && <Alert title={formError.title} hint={formError.hint} />}
      {!loaded && <LoadingText>Loading work…</LoadingText>}

      {loaded && (
        <form className="wedit" onSubmit={onSubmit} noValidate>
          <div className="field">
            <span className="wedit__label">Cover</span>
            <ImagePicker
              value={cover}
              onChange={setCover}
              onBusyChange={(busy) => setUploads((n) => n + (busy ? 1 : -1))}
              maxSide={1600}
              invalid={!!errorOf('coverMediaId')}
            />
            {errorOf('coverMediaId') && <p className="field__error">{errorOf('coverMediaId')}</p>}
          </div>

          <div className="field">
            <label htmlFor={`${idPrefix}-title`}>Title</label>
            <input
              id={`${idPrefix}-title`}
              type="text"
              value={title}
              aria-invalid={errorOf('title') ? true : undefined}
              onChange={(e) => setTitle(e.target.value)}
            />
            {errorOf('title') && <p className="field__error">{errorOf('title')}</p>}
          </div>

          <div className="wedit__row">
            <div className="field">
              <label htmlFor={`${idPrefix}-date`}>Release date</label>
              <input
                id={`${idPrefix}-date`}
                type="date"
                value={releaseDate}
                onChange={(e) => setReleaseDate(e.target.value)}
              />
              <p className="field__hint">Leave empty for Coming Soon</p>
            </div>
            <div className="field">
              <label htmlFor={`${idPrefix}-category`}>Category</label>
              <Select
                id={`${idPrefix}-category`}
                value={category}
                onChange={(v) => setCategory(v as WorkCategory)}
                options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
              />
              {errorOf('category') && <p className="field__error">{errorOf('category')}</p>}
            </div>
          </div>

          <div className="wedit__row">
            <div className="field">
              <label htmlFor={`${idPrefix}-sub`}>Subcategory</label>
              <input
                id={`${idPrefix}-sub`}
                type="text"
                list={`${idPrefix}-subs`}
                value={subcategory}
                aria-invalid={errorOf('subcategory') ? true : undefined}
                onChange={(e) => setSubcategory(e.target.value)}
              />
              <datalist id={`${idPrefix}-subs`}>
                {suggestions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              {errorOf('subcategory') && <p className="field__error">{errorOf('subcategory')}</p>}
            </div>
            <div className="field">
              <label htmlFor={`${idPrefix}-badge`}>Badge</label>
              <Select id={`${idPrefix}-badge`} value={profile} onChange={setProfile} options={profileOptions} />
              {errorOf('profile') && <p className="field__error">{errorOf('profile')}</p>}
            </div>
          </div>

          <div className="field">
            <label htmlFor={`${idPrefix}-desc`}>Description</label>
            <textarea
              id={`${idPrefix}-desc`}
              rows={4}
              value={description}
              aria-invalid={errorOf('description') ? true : undefined}
              onChange={(e) => setDescription(e.target.value)}
            />
            {errorOf('description') && <p className="field__error">{errorOf('description')}</p>}
          </div>

          <LinksEditor value={links} onChange={setLinks} errors={fieldErrors} newKey={newKey} />
          <CreditsEditor value={credits} category={category} onChange={setCredits} errors={fieldErrors} newKey={newKey} />

          <div className="peditor__actions">
            <button type="submit" className="button button--primary" disabled={saving || uploads > 0}>
              Save
            </button>
            <Link className="button button--s" to={id === null ? '/works' : `/works/${id}`}>
              Cancel
            </Link>
            {id !== null && (
              <button type="button" className="button button--s button--danger" onClick={() => void remove()}>
                <Trash2 className="icon" aria-hidden="true" />
                Delete work
              </button>
            )}
          </div>
        </form>
      )}
    </main>
  );
}
