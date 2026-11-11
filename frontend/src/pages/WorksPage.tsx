import { Clapperboard, Pencil, Plus, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { ProfilePage } from '../api/profiles';
import type { WorkCategory, WorkSummary } from '../api/works';
import { EmptyState } from '../components/EmptyState';
import { CATEGORIES } from '../components/works/categories';
import { CategoryPills } from '../components/works/CategoryPills';
import { PeopleDialog } from '../components/works/PeopleDialog';
import { WorkCard } from '../components/works/WorkCard';
import { Alert } from '../components/ui/Alert';
import { IconLink } from '../components/ui/IconButton';
import { LoadingText } from '../components/ui/LoadingText';
import { PageHeader } from '../components/ui/PageHeader';
import { PeopleFilter } from '../components/ui/PeopleFilter';
import { useSite } from '../data/SiteContext';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import { peopleOf } from './PhotosPage';
import '../components/works/WorkCard.css';
import './WorksPage.css';

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
  const nameOf = useMemo(() => new Map(people.map((p) => [p.slug, p.name])), [people]);
  const visible = useMemo(
    () => (works ?? []).filter((w) => (who === null || w.profile === who) && (cat === null || w.category === cat)),
    [works, who, cat],
  );

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
        lede={works === null ? undefined : `${visible.length} ${visible.length === 1 ? 'work' : 'works'}`}
        actions={
          !readOnly && (
            <div className="works-actions">
              <button type="button" className="button button--small" onClick={() => setPeopleOpen(true)}>
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

      {people.length > 0 && <PeopleFilter people={people} value={who} onChange={(slug) => setFilter('who', slug)} />}
      <CategoryPills value={cat} onChange={(c) => setFilter('cat', c)} />

      {error && <Alert title={error.title} hint={error.hint} />}
      {works === null && !error && <LoadingText>Loading works…</LoadingText>}
      {works !== null && visible.length === 0 && !error && (
        <EmptyState icon={Clapperboard}>No works here yet.</EmptyState>
      )}

      {visible.length > 0 && (
        <ul className="work-grid" aria-label="Works">
          {visible.map((w) => (
            <WorkCard key={w.id} work={w} badge={w.profile ? (nameOf.get(w.profile) ?? null) : null}>
              {!readOnly && (
                <div className="work-card__edit">
                  <IconLink to={`/works/${w.id}/edit`} label={`Edit ${w.title}`} icon={Pencil} />
                </div>
              )}
            </WorkCard>
          ))}
        </ul>
      )}
      {!readOnly && <PeopleDialog open={peopleOpen} onOpenChange={setPeopleOpen} />}
    </main>
  );
}
