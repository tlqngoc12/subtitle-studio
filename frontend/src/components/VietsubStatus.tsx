import { Languages, Loader2 } from 'lucide-react';
import { Link } from 'react-router';
import { viSrtUrl, type SkipReason, type VideoDto } from '../api/client';
import { Tip } from './Tip';
import './VietsubStatus.css';

interface Props {
  video: VideoDto;
  /** Profile chosen in the link frame; '' = none, so translating is not possible. */
  profile: string;
  /** Why Get Engsub did not start a translation, for the video just fetched. */
  skipReason: SkipReason | null;
  onTranslate: (video: VideoDto) => void;
}

const SKIP_MESSAGES: Partial<Record<SkipReason, string>> = {
  VIDEO_TOO_LONG: 'The video is longer than 60 minutes, so it cannot be translated automatically.',
  GEMINI_NOT_CONFIGURED: 'GEMINI_API_KEY is not set.',
};

/** The "Vietsub" line of the result panel: Gemini progress, the current Vietsub and its source, or why not. */
export function VietsubStatus({ video, profile, skipReason, onTranslate }: Props) {
  function translateButton(label: string) {
    const button = (
      <button className="button button--s" type="button" disabled={!profile} onClick={() => onTranslate(video)}>
        <Languages className="icon" aria-hidden="true" />
        {label}
      </button>
    );
    // A disabled button gets no pointer events, so the tip sits on a wrapper that is always rendered.
    return (
      <Tip label="Choose a translation profile above" disabled={Boolean(profile)}>
        <span className="tip-target" tabIndex={profile ? undefined : 0}>
          {button}
        </span>
      </Tip>
    );
  }

  if (video.translationStatus === 'TRANSLATING') {
    return (
      <p className="vietsub-status">
        <Loader2 className="icon icon--spin" aria-hidden="true" />
        {`Translating${video.activePart ? ` part ${video.activePart}` : ''} with Gemini (${video.translationModel ? `${video.translationProfile}, ${video.translationModel}` : video.translationProfile})…`}
      </p>
    );
  }

  const watch = (
    <Link className="vietsub-status__link" to={`/vietsub/${video.id}`}>
      Watch Vietsub
    </Link>
  );

  return (
    <div className="vietsub-status">
      {video.translationStatus === 'FAILED' && (
        <p className="vietsub-status__error" role="alert">
          {video.translationError}
        </p>
      )}
      {video.viSource === 'AUTO' && (
        <p className="vietsub-status__line">
          <span>Vietsub: AI</span>
          {video.translationModel && <span className="meta">Translated by {video.translationModel}</span>}
          {watch}
          <a className="vietsub-status__link" href={viSrtUrl(video.id)} download>
            Download Vietsub
          </a>
          {translateButton('Translate again')}
        </p>
      )}
      {video.viSource === 'MANUAL' && (
        <>
          <p className="vietsub-status__line">
            <span>Vietsub: Manual</span>
            {watch}
          </p>
          <p className="vietsub-status__note">Delete the uploaded Vietsub on the Vietsub page to translate with Gemini.</p>
        </>
      )}
      {video.viSource === null && video.translationStatus === 'FAILED' && (
        <p className="vietsub-status__line">{translateButton('Translate again')}</p>
      )}
      {video.viSource === null && video.translationStatus === null && (
        <p className="vietsub-status__line">
          {skipReason && SKIP_MESSAGES[skipReason] ? SKIP_MESSAGES[skipReason] : translateButton('Translate with Gemini')}
        </p>
      )}
    </div>
  );
}
