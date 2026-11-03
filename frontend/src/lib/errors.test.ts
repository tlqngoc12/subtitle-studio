import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { errorMessage } from './errors';

describe('errorMessage', () => {
  it.each([
    ['INVALID_URL', 'Link không hợp lệ'],
    ['NO_ENGLISH_SUBTITLE', 'Video này không có phụ đề tiếng Anh'],
    ['YTDLP_FAILED', 'Không lấy được phụ đề từ YouTube'],
    ['YTDLP_TIMEOUT', 'YouTube phản hồi quá lâu'],
    ['VIDEO_NOT_FOUND', 'Video này không còn trong danh sách'],
    ['INTERNAL_ERROR', 'Máy chủ gặp lỗi'],
    ['GEMINI_NOT_CONFIGURED', 'Chưa cấu hình Gemini'],
    ['UNKNOWN_PROFILE', 'Hồ sơ dịch không tồn tại'],
    ['VIDEO_TOO_LONG', 'Video dài hơn 60 phút'],
    ['VIETSUB_MANUAL', 'Video đã có Vietsub tự upload'],
    ['TRANSLATION_IN_PROGRESS', 'Video đang được dịch'],
  ])('maps %s to a Vietnamese message', (code, expected) => {
    expect(errorMessage(new ApiError(400, code, 'detail')).title).toContain(expected);
  });

  it('explains an unreadable .srt and keeps the server detail', () => {
    const msg = errorMessage(new ApiError(400, 'INVALID_SRT', 'No subtitle blocks found'));
    expect(msg.title).toContain('Không đọc được file .srt');
    expect(msg.hint).toBe('No subtitle blocks found');
  });

  it('explains a file that is too large', () => {
    expect(errorMessage(new ApiError(413, 'FILE_TOO_LARGE', 'Upload exceeds 5 MB')).title).toContain('tối đa 5 MB');
  });

  it('keeps the server detail as a hint for yt-dlp failures', () => {
    const msg = errorMessage(new ApiError(502, 'YTDLP_FAILED', 'ERROR: Video unavailable'));
    expect(msg.hint).toBe('ERROR: Video unavailable');
  });

  it.each([
    ['PROFILE_NOT_FOUND', 'Không tìm thấy profile.'],
    ['BLOCK_NOT_FOUND', 'Khối này không còn nữa.'],
    ['INVALID_BLOCK', 'Nội dung khối chưa hợp lệ.'],
    ['INVALID_MEDIA', 'File không phải ảnh JPEG, PNG, WebP hoặc GIF.'],
    ['MEDIA_TOO_LARGE', 'Ảnh quá lớn (tối đa 10 MB).'],
    ['MEDIA_NOT_FOUND', 'Không tìm thấy ảnh.'],
  ])('maps profile code %s', (code, expected) => {
    expect(errorMessage(new ApiError(400, code, 'detail')).title).toBe(expected);
  });

  it('asks to reload when a block is gone', () => {
    expect(errorMessage(new ApiError(404, 'BLOCK_NOT_FOUND', 'x')).hint).toBe('Tải lại trang.');
  });

  it('keeps field errors from an INVALID_BLOCK problem', () => {
    const e = new ApiError(400, 'INVALID_BLOCK', 'x', [{ field: 'items[0].value', message: 'Sai link' }]);
    expect(e.fieldErrors).toEqual([{ field: 'items[0].value', message: 'Sai link' }]);
    expect(new ApiError(400, 'X', 'y').fieldErrors).toEqual([]);
  });

  it('explains network failures', () => {
    expect(errorMessage(new ApiError(0, 'NETWORK', 'Failed to fetch')).title)
      .toContain('Không kết nối được máy chủ');
  });

  it('falls back to the HTTP status when there is no known code', () => {
    expect(errorMessage(new ApiError(405, null, 'Method not allowed')).title).toContain('HTTP 405');
  });

  it('handles non-API errors', () => {
    expect(errorMessage(new Error('boom')).title).toContain('Có lỗi xảy ra');
  });
});
