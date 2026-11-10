import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router';
import type { ProfilePage as ProfilePageData } from '../api/profiles';
import { EmptyState } from '../components/EmptyState';
import { MemberSection } from '../components/profile/MemberSection';
import { ProfileBanner } from '../components/profile/ProfileBanner';
import { Alert } from '../components/ui/Alert';
import { LoadingText } from '../components/ui/LoadingText';
import { PageHeader } from '../components/ui/PageHeader';
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
  const [data, setData] = useState<ProfilePageData | null>(null);
  const [error, setError] = useState<ErrorMessage | null>(null);

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

  // Data published before the banner existed has no `banner` field.
  const banner = data?.group?.banner ?? [];

  return (
    <main className="page">
      <PageHeader title="Profile" />

      {error && <Alert title={error.title} hint={error.hint} />}
      {data === null && !error && <LoadingText>Loading profile…</LoadingText>}

      {data && (
        <>
          <ProfileBanner images={banner} />

          {data.members.length === 0 ? (
            <EmptyState icon={Sparkles}>Nothing here yet — check back soon.</EmptyState>
          ) : (
            <div className="pmembers">
              {data.members.map((m, i) => (
                <MemberSection key={m.slug} profile={m} side={i % 2 === 0 ? 'left' : 'right'} />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
