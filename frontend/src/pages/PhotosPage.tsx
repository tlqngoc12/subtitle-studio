import { Camera } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { PhotoPost } from '../api/photos';
import type { ProfilePage } from '../api/profiles';
import { EmptyState } from '../components/EmptyState';
import { PhotoTile } from '../components/photos/PhotoTile';
import { Alert } from '../components/ui/Alert';
import { LoadingText } from '../components/ui/LoadingText';
import { PageHeader } from '../components/ui/PageHeader';
import { PeopleFilter, type Person } from '../components/ui/PeopleFilter';
import { useSite } from '../data/SiteContext';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import '../components/photos/PhotoTile.css';
import './PhotosPage.css';

const PAGE_SIZE = 24;

/** The group and the members as filter buttons, with their portraits as avatars. */
export function peopleOf(page: ProfilePage | null): Person[] {
  if (!page) return [];
  return [page.group, ...page.members].map((p) => ({ slug: p.slug, name: p.displayName, avatarUrl: p.portraitUrl }));
}

/** Photos (/photos): Instagram posts as a bento grid, filtered by person (`?who=`), 24 tiles at a time. */
export default function PhotosPage() {
  const { source, readOnly } = useSite();
  const [params, setParams] = useSearchParams();
  const who = params.get('who');
  const [posts, setPosts] = useState<PhotoPost[] | null>(null);
  const [page, setPage] = useState<ProfilePage | null>(null);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [shown, setShown] = useState(PAGE_SIZE);

  useEffect(() => {
    let current = true;
    source
      .listPhotos()
      .then((p) => current && setPosts(p))
      .catch((e) => {
        if (!current) return;
        setPosts([]);
        setError(errorMessage(e, { readOnly }));
      });
    // Avatars are a nicety: the grid works without them.
    source
      .getProfilePage()
      .then((p) => current && setPage(p))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [source, readOnly]);

  useEffect(() => setShown(PAGE_SIZE), [who]);

  const people = useMemo(() => peopleOf(page), [page]);
  const visible = useMemo(
    () => (posts ?? []).filter((p) => who === null || p.profiles.includes(who)),
    [posts, who],
  );

  return (
    <main className="page">
      <PageHeader title="Photos" lede="Official, media and fan photos" />

      {people.length > 0 && (
        <PeopleFilter
          people={people}
          value={who}
          onChange={(slug) => setParams(slug ? { who: slug } : {}, { replace: true })}
        />
      )}

      {error && <Alert title={error.title} hint={error.hint} />}
      {posts === null && !error && <LoadingText>Loading photos…</LoadingText>}

      {posts !== null && visible.length === 0 && !error && (
        <EmptyState icon={Camera}>No photos here yet.</EmptyState>
      )}

      {visible.length > 0 && (
        <ul className="photo-grid" aria-label="Photos">
          {visible.slice(0, shown).map((post) => (
            <PhotoTile key={post.id} post={post} />
          ))}
        </ul>
      )}

      {visible.length > shown && (
        <div className="photo-more">
          <button type="button" className="button" onClick={() => setShown((n) => n + PAGE_SIZE)}>
            Load more
          </button>
        </div>
      )}
    </main>
  );
}
