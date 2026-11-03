import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError } from '../api/client';
import { getProfile, listProfiles, type Profile, type ProfileSummary } from '../api/profiles';
import { BlockView } from '../components/profile/BlockView';
import { ProfileTabs } from '../components/profile/ProfileTabs';
import { errorMessage, type ErrorMessage } from '../lib/errors';

/** Profile page (/profiles/:slug): name, tabs and the blocks in order. */
export default function ProfilePage() {
  const { slug = 'emibonnie' } = useParams();
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<{ message: ErrorMessage; notFound: boolean } | null>(null);

  useEffect(() => {
    listProfiles()
      .then(setProfiles)
      .catch(() => setProfiles([]));
  }, []);

  useEffect(() => {
    let current = true;
    setProfile(null);
    setError(null);
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
          <header className="masthead">
            <h1 className="masthead__name">{profile.displayName}</h1>
          </header>
          <div className="pblocks">
            {profile.blocks.length === 0 && <p className="muted">Profile này chưa có nội dung.</p>}
            {profile.blocks.map((b) => (
              <BlockView key={b.id} block={b} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
