import { srtUrl, type CueDto, type SkipReason, type VideoDto } from '../api/client';
import { formatDuration } from '../lib/format';
import { CueTable } from './CueTable';
import { VietsubStatus } from './VietsubStatus';

interface Props {
  video: VideoDto;
  cues: CueDto[] | null;
  /** Translation profile chosen in the link frame ('' = none). */
  profile: string;
  skipReason: SkipReason | null;
  onTranslate: (video: VideoDto) => void;
}

export function ResultPanel({ video, cues, profile, skipReason, onTranslate }: Props) {
  const duration = formatDuration(video.durationSec);
  const isAuto = video.subSource === 'AUTO';

  return (
    <section className="result" aria-label="Kết quả">
      <div className="result__meta">
        <img
          className="result__thumb"
          src={video.thumbnailUrl}
          alt={`Ảnh thu nhỏ của ${video.title}`}
          width={320}
          height={180}
        />
        <h2 className="result__title">{video.title}</h2>
        <p className="result__byline">
          {video.channel && <span>{video.channel}</span>}
          {duration && <span>{duration}</span>}
        </p>
        <p className="result__source">{video.cueCount} câu</p>
        <VietsubStatus video={video} profile={profile} skipReason={skipReason} onTranslate={onTranslate} />
        {isAuto && (
          <p className="result__note">
            Phụ đề tự động của YouTube: không có dấu câu, bạn sẽ cần tự ngắt câu khi dịch.
          </p>
        )}
        <a className="button button--primary" href={srtUrl(video.id)} download>
          Tải .srt
        </a>
      </div>
      <div className="result__preview">
        {cues === null ? <p className="muted">Đang tải bản xem trước…</p> : <CueTable cues={cues} />}
      </div>
    </section>
  );
}
