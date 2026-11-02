import { srtUrl, type CueDto, type VideoDto } from '../api/client';
import { formatDuration } from '../lib/format';
import { CueTable } from './CueTable';

interface Props {
  video: VideoDto;
  cues: CueDto[] | null;
}

export function ResultPanel({ video, cues }: Props) {
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
        <p className="result__source">
          <span className={isAuto ? 'badge badge--auto' : 'badge'}>{isAuto ? 'Auto-generated' : 'Manual'}</span>
          <span>{video.cueCount} câu</span>
        </p>
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
