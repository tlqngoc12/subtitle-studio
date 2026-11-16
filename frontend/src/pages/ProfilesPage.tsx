import { useEffect, useId, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { getPromptProfiles, type PromptProfiles } from '../api/client';
import {
  analyzeProfile,
  getProfileDetails,
  saveProfile,
  type ProfileAnalysis,
  type ProfileDetails,
} from '../api/promptProfiles';
import { ProfileAnalyzePanel } from '../components/profiles/ProfileAnalyzePanel';
import { Alert } from '../components/ui/Alert';
import { LoadingText } from '../components/ui/LoadingText';
import { Page } from '../components/ui/Page';
import { PageHeader } from '../components/ui/PageHeader';
import { Select } from '../components/ui/Select';
import { VietsubTabs } from '../components/VietsubTabs';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import './ProfilesPage.css';

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Vietsub › Profiles: pick a profile; the shared panel lets Gemini propose a better one from the corrected lines. */
export default function ProfilesPage() {
  const ids = useId();
  const [params, setParams] = useSearchParams();
  const selected = params.get('profile') ?? '';

  const [profiles, setProfiles] = useState<PromptProfiles | null>(null);
  const [details, setDetails] = useState<ProfileDetails | null>(null);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    getPromptProfiles()
      .then(setProfiles)
      .catch((e) => {
        setProfiles({ configured: false, profiles: [] });
        setError(errorMessage(e));
      });
  }, []);

  function loadDetails(name: string) {
    getProfileDetails(name)
      .then((d) => alive.current && setDetails(d))
      .catch((e) => alive.current && setError(errorMessage(e)));
  }

  useEffect(() => {
    setDetails(null);
    if (selected) loadDetails(selected);
  }, [selected]);

  const reason = !selected
    ? 'Choose a profile first'
    : !details
      ? 'Loading the profile…'
      : !profiles?.configured
        ? 'GEMINI_API_KEY is not set'
        : details.stats.correctedLines === 0
          ? 'No corrected lines yet'
          : null;

  return (
    <Page>
      <PageHeader title="Vietsub" lede="Improve a translation profile from the lines you corrected." />
      <VietsubTabs>
        <ProfileAnalyzePanel<ProfileAnalysis>
          name={details?.name ?? ''}
          text={details?.text ?? ''}
          sha={details?.sha ?? ''}
          stats={
            details
              ? `${plural(details.stats.videos, 'video')} · ${plural(details.stats.correctedLines, 'corrected line')}`
              : null
          }
          disabledReason={reason}
          analyze={() => analyzeProfile(selected)}
          save={(text, baseSha) => saveProfile(selected, text, baseSha)}
          onSaved={() => loadDetails(selected)}
          picker={(locked) => (
            <div className="field profiles__select">
              <label htmlFor={`${ids}-profile`}>Profile</label>
              <Select
                id={`${ids}-profile`}
                value={selected}
                disabled={locked || profiles === null}
                onChange={(name) => {
                  setError(null);
                  setParams(name ? { profile: name } : {}, { replace: true });
                }}
                options={[
                  { value: '', label: 'Choose a profile…' },
                  ...(profiles?.profiles ?? []).map((name) => ({ value: name, label: name })),
                ]}
              />
            </div>
          )}
          basedOnNote={(a) =>
            `Based on ${plural(a.basedOn.lines, 'line')} from ${plural(a.basedOn.videos, 'video')}`
          }
          notice={
            <>
              {error && <Alert title={error.title} hint={error.hint} />}
              {profiles === null && <LoadingText>Loading profiles…</LoadingText>}
              {profiles !== null && profiles.profiles.length === 0 && !error && (
                <p className="muted">No profiles yet. Add a .md file to ./data/prompts.</p>
              )}
            </>
          }
        />
      </VietsubTabs>
    </Page>
  );
}
