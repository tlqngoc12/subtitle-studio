import { Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
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
import { CategoryToggleGroup } from '../components/works/CategoryToggleGroup';
import { isFilm, subcategorySuggestions } from '../components/works/categories';
import { CreditsEditor, type CreditRow } from '../components/works/CreditsEditor';
import { LinksEditor, type LinkRow } from '../components/works/LinksEditor';
import { ImageDropzone, previewOf, toPicked, type PickedImage } from '../components/ui/ImageDropzone';
import { Alert } from '../components/ui/Alert';
import { Combobox } from '../components/ui/Combobox';
import { DatePicker } from '../components/ui/DatePicker';
import { Field } from '../components/ui/Field';
import { LoadingText } from '../components/ui/LoadingText';
import { FormActions } from '../components/ui/FormActions';
import { Page } from '../components/ui/Page';
import { PageHeader } from '../components/ui/PageHeader';
import { Select } from '../components/ui/Select';
import { useConfirmDialog } from '../components/useConfirmDialog';
import { peopleForBadge } from '../lib/badgePeople';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import './WorkEditPage.css';

const blankToNull = (s: string) => (s.trim() === '' ? null : s.trim());

/** Add or edit a work (`/works/new`, `/works/:id/edit`): cover, details, links and people. */
export default function WorkEditPage() {
  const { id: raw } = useParams();
  const id = raw === undefined ? null : /^[1-9]\d*$/.test(raw) ? Number(raw) : NaN;
  const navigate = useNavigate();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const nextKey = useRef(0);
  const newKey = () => nextKey.current++;

  const [loaded, setLoaded] = useState(id === null);
  const [notFound, setNotFound] = useState(Number.isNaN(id));
  const [title, setTitle] = useState('');
  /** The title as stored: the breadcrumb must not follow what is being typed. */
  const [savedTitle, setSavedTitle] = useState('');
  const [releaseDate, setReleaseDate] = useState<string | null>(null);
  const [categories, setCategories] = useState<WorkCategory[]>(['FILM_TV']);
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
        setSavedTitle(w.title);
        setReleaseDate(w.releaseDate);
        setCategories(w.categories);
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
    () =>
      subcategorySuggestions(
        categories,
        allWorks.filter((w) => w.categories.some((c) => categories.includes(c)) && w.subcategory).map((w) => w.subcategory as string),
      ),
    [allWorks, categories],
  );


  // Changing the Badge brings its member(s) into People: only adds, never removes, skips anyone already credited.
  // Loading an existing work sets `profile` directly and never comes through here.
  const badgeRun = useRef(0);
  const creditsRef = useRef(credits);
  creditsRef.current = credits;
  async function changeBadge(slug: string) {
    setProfile(slug);
    const run = ++badgeRun.current;
    if (slug === '' || !profiles) return;
    try {
      const { toAdd } = await peopleForBadge(profiles, slug, creditsRef.current.map((c) => c.person.id));
      if (run !== badgeRun.current || toAdd.length === 0) return;
      setCredits((rows) => {
        const have = new Set(rows.map((r) => r.person.id));
        return [...rows, ...toAdd.filter((p) => !have.has(p.id)).map((person) => ({ key: newKey(), person, role: '', characterName: '' }))];
      });
      toast.success(`Added ${toAdd.map((p) => p.name).join(', ')} to People`);
    } catch (e) {
      if (run === badgeRun.current) toast.error(`Could not add the Badge's people: ${errorMessage(e).title}`);
    }
  }
  const input = (): WorkInput => ({
    title: title.trim(),
    coverMediaId: cover?.mediaId ?? null,
    releaseDate,
    categories,
    subcategory: blankToNull(subcategory),
    profile: profile === '' ? null : profile,
    description: blankToNull(description),
    links: links.map((l) => ({ kind: l.kind, label: l.label.trim(), url: l.url.trim(), icon: l.icon === '' ? null : l.icon })),
    credits: credits.map((c) => ({
      personId: c.person.id,
      role: blankToNull(c.role),
      characterName: isFilm(categories) ? blankToNull(c.characterName) : null,
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


  if (notFound) {
    return (
      <Page width="narrow">
        <PageHeader
          breadcrumbs={[{ label: 'Works', to: '/works' }, { label: 'Not found' }]}
          title="Work not found"
        />
      </Page>
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
    <Page width="narrow">
      {confirmDialog}
      <PageHeader
        breadcrumbs={
          id === null
            ? [{ label: 'Works', to: '/works' }, { label: 'Add work' }]
            : [{ label: 'Works', to: '/works' }, { label: savedTitle || 'Work', to: `/works/${id}` }, { label: 'Edit' }]
        }
        title={id === null ? 'Add work' : 'Edit work'}
      />
      {formError && <Alert title={formError.title} hint={formError.hint} />}
      {!loaded && <LoadingText>Loading work…</LoadingText>}

      {loaded && (
        <form className="wedit" onSubmit={onSubmit} noValidate>
          <div className="field">
            <span className="field__label">Cover</span>
            <ImageDropzone
              label="Cover image"
              value={previewOf(cover)}
              aspect="4/5"
              maxSide={1600}
              onUploaded={(media) => setCover(toPicked(media))}
              onBusyChange={(busy) => setUploads((n) => n + (busy ? 1 : -1))}
              invalid={!!errorOf('coverMediaId')}
            />
            {errorOf('coverMediaId') && <p className="field__error">{errorOf('coverMediaId')}</p>}
          </div>

          <Field label="Title" error={errorOf('title')}>
            {(f) => (
              <input
                id={f.id}
                type="text"
                value={title}
                aria-invalid={f.invalid || undefined}
                aria-describedby={f.describedBy}
                onChange={(e) => setTitle(e.target.value)}
              />
            )}
          </Field>

          <div className="wedit__row">
            <Field label="Release date" hint="Leave empty for Coming Soon">
              {(f) => (
                <DatePicker
                  id={f.id}
                  aria-describedby={f.describedBy}
                  value={releaseDate}
                  onChange={setReleaseDate}
                  clearable
                />
              )}
            </Field>
            <Field label="Badge" error={errorOf('profile')}>
              {(f) => <Select id={f.id} value={profile} onChange={(v) => void changeBadge(v)} options={profileOptions} aria-describedby={f.describedBy} />}
            </Field>
          </div>

          <div className="field">
            <span className="field__label">Categories</span>
            <CategoryToggleGroup value={categories} onChange={setCategories} error={errorOf('categories')} />
          </div>

          <Field label="Subcategory" error={errorOf('subcategory')}>
            {(f) => (
              <Combobox
                id={f.id}
                value={subcategory}
                suggestions={suggestions}
                openOnFocus
                aria-invalid={f.invalid || undefined}
                aria-describedby={f.describedBy}
                onChange={setSubcategory}
              />
            )}
          </Field>

          <Field label="Description" error={errorOf('description')}>
            {(f) => (
              <textarea
                id={f.id}
                rows={4}
                value={description}
                aria-invalid={f.invalid || undefined}
                aria-describedby={f.describedBy}
                onChange={(e) => setDescription(e.target.value)}
              />
            )}
          </Field>

          <LinksEditor value={links} onChange={setLinks} errors={fieldErrors} newKey={newKey} />
          <CreditsEditor value={credits} categories={categories} onChange={setCredits} errors={fieldErrors} newKey={newKey} />

          <FormActions
            sticky
            start={
              id !== null && (
                <button type="button" className="button button--danger" onClick={() => void remove()}>
                  <Trash2 className="icon" aria-hidden="true" />
                  Delete work
                </button>
              )
            }
          >
            <Link className="button" to={id === null ? '/works' : `/works/${id}`}>
              Cancel
            </Link>
            <button type="submit" className="button button--primary" disabled={saving || uploads > 0}>
              Save
            </button>
          </FormActions>
        </form>
      )}
    </Page>
  );
}
