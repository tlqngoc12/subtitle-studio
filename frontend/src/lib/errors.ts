import { ApiError } from '../api/client';

export interface ErrorMessage {
  title: string;
  hint?: string;
}

/** Turns an API error into user-facing Vietnamese copy, keyed by the backend's ProblemDetail `code`. */
export function errorMessage(error: unknown): ErrorMessage {
  if (!(error instanceof ApiError)) {
    return { title: 'Có lỗi xảy ra.', hint: error instanceof Error ? error.message : undefined };
  }
  switch (error.code) {
    case 'INVALID_URL':
      return {
        title: 'Link không hợp lệ.',
        hint: 'Dán link dạng youtube.com/watch?v=…, youtu.be/…, youtube.com/shorts/… hoặc mã video 11 ký tự.',
      };
    case 'NO_ENGLISH_SUBTITLE':
      return {
        title: 'Video này không có phụ đề tiếng Anh.',
        hint: 'Không có cả phụ đề do người đăng tải lên lẫn phụ đề tự động tiếng Anh.',
      };
    case 'YTDLP_FAILED':
      return { title: 'Không lấy được phụ đề từ YouTube.', hint: error.detail };
    case 'YTDLP_TIMEOUT':
      return { title: 'YouTube phản hồi quá lâu.', hint: 'Thử lại sau ít phút.' };
    case 'VIDEO_NOT_FOUND':
      return {
        title: 'Video này không còn trong danh sách.',
        hint: 'Có thể nó đã bị xoá. Tải lại trang để cập nhật danh sách.',
      };
    case 'INTERNAL_ERROR':
      return { title: 'Máy chủ gặp lỗi.', hint: 'Xem log của ứng dụng để biết chi tiết.' };
    case 'INVALID_SRT':
      return {
        title: 'Không đọc được file .srt. Kiểm tra file đúng định dạng SubRip và lưu bằng UTF-8.',
        hint: error.detail,
      };
    case 'FILE_TOO_LARGE':
      return { title: 'File quá lớn (tối đa 5 MB).' };
    case 'GEMINI_NOT_CONFIGURED':
      return { title: 'Chưa cấu hình Gemini.', hint: 'Đặt GEMINI_API_KEY trong file .env rồi khởi động lại app.' };
    case 'UNKNOWN_PROFILE':
      return {
        title: 'Hồ sơ dịch không tồn tại hoặc không dùng được.',
        hint: 'Kiểm tra file trong ./data/prompts (UTF-8, tối đa 20 KB).',
      };
    case 'VIDEO_TOO_LONG':
      return { title: 'Video dài hơn 60 phút, không dịch tự động được.' };
    case 'VIETSUB_MANUAL':
      return {
        title: 'Video đã có Vietsub tự upload.',
        hint: 'Xoá Vietsub tự upload ở trang Vietsub nếu muốn dịch bằng Gemini.',
      };
    case 'TRANSLATION_IN_PROGRESS':
      return { title: 'Video đang được dịch.' };
    case 'NETWORK':
      return { title: 'Không kết nối được máy chủ.', hint: 'Kiểm tra Subtitle Studio có đang chạy không.' };
    default:
      return { title: `Có lỗi xảy ra (HTTP ${error.status}).`, hint: error.detail };
  }
}
