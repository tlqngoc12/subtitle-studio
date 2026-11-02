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
    case 'NETWORK':
      return { title: 'Không kết nối được máy chủ.', hint: 'Kiểm tra Subtitle Studio có đang chạy không.' };
    default:
      return { title: `Có lỗi xảy ra (HTTP ${error.status}).`, hint: error.detail };
  }
}
