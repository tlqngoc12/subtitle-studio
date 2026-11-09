import type { Ref } from 'react';
import { srtUrl, type CueDto, type SkipReason, type VideoDto } from '../api/client';
import { formatDuration } from '../lib/format';
import { CueTable } from './CueTable';
import { VietsubStatus } from './VietsubStatus';
import { LoadingText } from './ui/LoadingText';

interface Props {
  video: VideoDto;
  cues: CueDto[] | null;
  /** Translation profile chosen in the link frame ('' = none). */
  profile: string;
  skipReason: SkipReason | null;
  onTranslate: (video: VideoDto) => void;
  /** The panel's <section>, so the page can scroll to it. */
  ref?: Ref<HTMLElement>;
}

export function ResultPanel({ video, cues, profile, skipReason, onTranslate, ref }: Props) {
  const duration = formatDuration(video.durationSec);
  const isAuto = video.subSource === 'AUTO';

  return (
    <section className="result" aria-label="Result" ref={ref}>
      <div className="result__meta">
        <img
          className="result__thumb"
          src={video.thumbnailUrl}
          alt={`Thumbnail of ${video.title}`}
          width={320}
          height={180}
        />
        <h2 className="result__title" tabIndex={-1}>
          {video.title}
        </h2>
        <p className="result__byline">
          {video.channel && <span>{video.channel}</span>}
          {duration && <span>{duration}</span>}
        </p>
        <p className="result__source">{video.cueCount} lines</p>
        <VietsubStatus video={video} profile={profile} skipReason={skipReason} onTranslate={onTranslate} />
        {isAuto && (
          <p className="result__note">
            YouTube auto-generated captions: there is no punctuation, so you will need to split sentences yourself when translating.
          </p>
        )}
        <a className="button button--primary" href={srtUrl(video.id)} download>
          Download Engsub
        </a>
      </div>
      <div className="result__preview">
        {cues === null ? <LoadingText>Loading preview…</LoadingText> : <CueTable cues={cues} />}
      </div>
    </section>
  );
}
