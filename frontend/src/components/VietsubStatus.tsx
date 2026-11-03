import { Languages, Loader2 } from 'lucide-react';
import { Link } from 'react-router';
import { viSrtUrl, type SkipReason, type VideoDto } from '../api/client';

interface Props {
  video: VideoDto;
  /** Profile chosen in the link frame; '' = none, so translating is not possible. */
  profile: string;
  /** Why Lấy Engsub did not start a translation, for the video just fetched. */
  skipReason: SkipReason | null;
  onTranslate: (video: VideoDto) => void;
}

const SKIP_MESSAGES: Partial<Record<SkipReason, string>> = {
  VIDEO_TOO_LONG: 'Video dài hơn 60 phút, không dịch tự động được.',
  GEMINI_NOT_CONFIGURED: 'Chưa cấu hình GEMINI_API_KEY.',
};

/** The "Vietsub" line of the result panel: Gemini progress, the current Vietsub and its source, or why not. */
export function VietsubStatus({ video, profile, skipReason, onTranslate }: Props) {
  const noProfileTitle = profile ? undefined : 'Chọn hồ sơ dịch ở khung phía trên';

  function translateButton(label: string) {
    return (
      <button
        className="button button--small"
        type="button"
        disabled={!profile}
        title={noProfileTitle}
        onClick={() => onTranslate(video)}
      >
        <Languages className="icon" aria-hidden="true" />
        {label}
      </button>
    );
  }

  if (video.translationStatus === 'TRANSLATING') {
    return (
      <p className="vietsub-status">
        <Loader2 className="icon icon--spin" aria-hidden="true" />
        Đang dịch bằng Gemini ({video.translationProfile})…
      </p>
    );
  }

  const watch = (
    <Link className="vietsub-status__link" to={`/vietsub/${video.id}`}>
      Xem Vietsub
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
          <span>Vietsub: Gemini · {video.translationProfile}</span>
          {watch}
          <a className="vietsub-status__link" href={viSrtUrl(video.id)} download>
            Tải .vi.srt
          </a>
          {translateButton('Dịch lại')}
        </p>
      )}
      {video.viSource === 'MANUAL' && (
        <>
          <p className="vietsub-status__line">
            <span>Vietsub: tự upload</span>
            {watch}
          </p>
          <p className="vietsub-status__note">Xoá Vietsub tự upload ở trang Vietsub nếu muốn dịch bằng Gemini.</p>
        </>
      )}
      {video.viSource === null && video.translationStatus === 'FAILED' && (
        <p className="vietsub-status__line">{translateButton('Dịch lại')}</p>
      )}
      {video.viSource === null && video.translationStatus === null && (
        <p className="vietsub-status__line">
          {skipReason && SKIP_MESSAGES[skipReason] ? SKIP_MESSAGES[skipReason] : translateButton('Dịch bằng Gemini')}
        </p>
      )}
    </div>
  );
}
