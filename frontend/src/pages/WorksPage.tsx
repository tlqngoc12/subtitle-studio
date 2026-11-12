import { Clapperboard, Pencil, Plus, Users } from 'lucide-react';
import { SkeletonGrid } from '../components/ui/Skeleton';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { ProfilePage } from '../api/profiles';
import type { WorkCategory, WorkSummary } from '../api/works';
import { EmptyState } from '../components/EmptyState';
import { CATEGORIES, CATEGORY_LABELS } from '../components/works/categories';
import { PeopleDialog } from '../components/works/PeopleDialog';
import { WorkCard } from '../components/works/WorkCard';
import { Alert } from '../components/ui/Alert';
import { FilterPills } from '../components/ui/FilterPills';
import { IconLink } from '../components/ui/IconButton';
import { PageHeader } from '../components/ui/PageHeader';
import { PeopleFilter } from '../components/ui/PeopleFilter';
import { useSite } from '../data/SiteContext';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import { groupByYear } from '../lib/groupByYear';
import { matchesPerson } from '../lib/people';
import { peopleOf } from './PhotosPage';
import '../components/works/WorkCard.css';
import './WorksPage.css';

const CATEGORY_OPTIONS = [
  { value: null, label: 'All' },
  ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] })),
] as { value: WorkCategory | null; label: string }[];

/** Works (/works): poster grid filtered by person (`?who=`) and category (`?cat=`). */
export default function WorksPage() {
  const { source, readOnly } = useSite();
  const [params, setParams] = useSearchParams();
  const who = params.get('who');
  const catParam = params.get('cat');
  const cat = CATEGORIES.includes(catParam as WorkCategory) ? (catParam as WorkCategory) : null;
  const [works, setWorks] = useState<WorkSummary[] | null>(null);
  const [profiles, setProfiles] = useState<ProfilePage | null>(null);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [peopleOpen, setPeopleOpen] = useState(false);

  useEffect(() => {
    let current = true;
    source
      .listWorks()
      .then((w) => current && setWorks(w))
      .catch((e) => {
        if (!current) return;
        setWorks([]);
        setError(errorMessage(e, { readOnly }));
      });
    source
      .getProfilePage()
      .then((p) => current && setProfiles(p))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [source, readOnly]);

  const people = useMemo(() => peopleOf(profiles), [profiles]);
  const groupSlug = profiles?.group.slug ?? null;
  const nameOf = useMemo(() => new Map(people.map((p) => [p.slug, p.name])), [people]);
  const visible = useMemo(
    () =>
      (works ?? []).filter(
        (w) => matchesPerson(w.profile ? [w.profile] : [], who, groupSlug) && (cat === null || w.categories.includes(cat)),
      ),
    [works, who, cat, groupSlug],
  );

  const groups = useMemo(() => groupByYear(visible, (w) => w.releaseDate), [visible]);

  const setFilter = (key: 'who' | 'cat', value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <main className="page">
      <PageHeader
        title="Works"
        lede="Series, music, shows and more."
        actions={
          !readOnly && (
            <div className="works-actions">
              <button type="button" className="button button--s" onClick={() => setPeopleOpen(true)}>
                <Users className="icon" aria-hidden="true" />
                People
              </button>
              <Link className="button button--primary" to="/works/new">
                <Plus className="icon" aria-hidden="true" />
                Add work
              </Link>
            </div>
          )
        }
      />

      <div className="works-filters">
        {people.length > 0 && <PeopleFilter people={people} value={who} onChange={(slug) => setFilter('who', slug)} />}
        <FilterPills label="Filter by category" options={CATEGORY_OPTIONS} value={cat} onChange={(c) => setFilter('cat', c)} />
      </div>

      {error && <Alert title={error.title} hint={error.hint} />}
      {works === null && !error && <SkeletonGrid count={8} aspect="4/5" />}
      {works !== null && visible.length === 0 && !error && (
        <EmptyState icon={Clapperboard}>No works here yet.</EmptyState>
      )}

      {groups.map((group) => {
        const headingId = `works-year-${group.year ?? 'soon'}`;
        return (
          <section key={headingId} className="works-year" aria-labelledby={headingId}>
            <h2 id={headingId} className="works-year__label">
              {group.label}
            </h2>
            <ul className="work-grid">
              {group.items.map((w, i) => (
                <WorkCard key={w.id} work={w} index={i} badge={w.profile ? (nameOf.get(w.profile) ?? null) : null}>
                  {!readOnly && (
                    <div className="work-card__edit">
                      <IconLink to={`/works/${w.id}/edit`} label={`Edit ${w.title}`} icon={Pencil} />
                    </div>
                  )}
                </WorkCard>
              ))}
            </ul>
          </section>
        );
      })}
      {!readOnly && <PeopleDialog open={peopleOpen} onOpenChange={setPeopleOpen} />}
    </main>
  );
}
