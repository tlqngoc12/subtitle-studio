import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { errorMessage } from './errors';

describe('errorMessage', () => {
  it.each([
    ['INVALID_URL', 'Invalid link'],
    ['NO_ENGLISH_SUBTITLE', 'This video has no English subtitles'],
    ['YTDLP_FAILED', 'Could not get subtitles from YouTube'],
    ['YTDLP_TIMEOUT', 'YouTube took too long to respond'],
    ['VIDEO_NOT_FOUND', 'This video is no longer in the list'],
    ['INTERNAL_ERROR', 'The server ran into an error'],
    ['GEMINI_NOT_CONFIGURED', 'Gemini is not set up'],
    ['UNKNOWN_PROFILE', 'This translation profile does not exist'],
    ['VIDEO_TOO_LONG', 'longer than 60 minutes'],
    ['VIETSUB_MANUAL', 'already has an uploaded Vietsub'],
    ['TRANSLATION_IN_PROGRESS', 'already being translated'],
    ['NOVEL_TRANSLATION_BUSY', 'Another chapter is still translating'],
    ['CHAPTER_ALREADY_TRANSLATED', 'already translated'],
    ['WATTPAD_PART_DELETED', 'deleted on Wattpad'],
    ['WATTPAD_PART_EMPTY', 'no text for this part'],
    ['WATTPAD_PART_NOT_FOUND', 'not in the story'],
    ['WATTPAD_NOTHING_NEXT', 'already translated'],
    ['PLAYLIST_NOT_FOUND', 'This playlist no longer exists.'],
    ['INVALID_PLAYLIST', 'Check the playlist name and description.'],
    ['VIDEO_HAS_NO_VIETSUB', 'Only videos with Vietsub can be added to a playlist.'],
    ['INVALID_PLAYLIST_ORDER', 'The playlist changed meanwhile. It has been reloaded.'],
    ['NOVEL_NOT_FOUND', 'This novel no longer exists.'],
    ['CHAPTER_NOT_FOUND', 'This chapter no longer exists.'],
    ['PAGE_NOT_FOUND', 'This page no longer exists.'],
    ['INVALID_NOVEL', 'Check the highlighted fields.'],
    ['INVALID_CHAPTER', 'Check the chapter number and title.'],
    ['DUPLICATE_NOVEL_SLUG', 'Another novel already uses this slug.'],
    ['DUPLICATE_CHAPTER_NUMBER', 'This novel already has a chapter with that number.'],
    ['INVALID_PAGE_ORDER', 'The pages changed meanwhile. They have been reloaded.'],
    ['CHAPTER_HAS_NO_PAGES', 'Add page screenshots before translating.'],
    ['CHAPTER_NOT_TRANSLATED', 'Every page needs a translation before publishing.'],
    ['NOTEBOOK_UPDATE_IN_PROGRESS', 'The notebook is being updated.'],
    ['CHAPTER_PUBLISHED', 'This chapter is published.'],
  ])('maps %s to an English message', (code, expected) => {
    expect(errorMessage(new ApiError(400, code, 'detail')).title).toContain(expected);
  });

  it('explains an unreadable .srt and keeps the server detail', () => {
    const msg = errorMessage(new ApiError(400, 'INVALID_SRT', 'No subtitle blocks found'));
    expect(msg.title).toContain('Could not read the .srt file');
    expect(msg.hint).toBe('No subtitle blocks found');
  });

  it('explains a file that is too large', () => {
    expect(errorMessage(new ApiError(413, 'FILE_TOO_LARGE', 'Upload exceeds 5 MB')).title).toContain('5 MB max');
  });

  it('keeps the server detail as a hint for yt-dlp failures', () => {
    const msg = errorMessage(new ApiError(502, 'YTDLP_FAILED', 'ERROR: Video unavailable'));
    expect(msg.hint).toBe('ERROR: Video unavailable');
  });

  it.each([
    ['PROFILE_NOT_FOUND', 'Profile not found.'],
    ['BLOCK_NOT_FOUND', 'This block no longer exists.'],
    ['INVALID_BLOCK', 'Some block fields are not valid.'],
    ['INVALID_MEDIA', 'The file is not a JPEG, PNG, WebP or GIF image.'],
    ['MEDIA_TOO_LARGE', 'Image too large (10 MB max).'],
    ['MEDIA_NOT_FOUND', 'Image not found.'],
  ])('maps profile code %s', (code, expected) => {
    expect(errorMessage(new ApiError(400, code, 'detail')).title).toBe(expected);
  });

  it('asks to reload when a block is gone', () => {
    expect(errorMessage(new ApiError(404, 'BLOCK_NOT_FOUND', 'x')).hint).toBe('Reload the page.');
  });

  it('keeps field errors from an INVALID_BLOCK problem', () => {
    const e = new ApiError(400, 'INVALID_BLOCK', 'x', [{ field: 'items[0].value', message: 'Sai link' }]);
    expect(e.fieldErrors).toEqual([{ field: 'items[0].value', message: 'Sai link' }]);
    expect(new ApiError(400, 'X', 'y').fieldErrors).toEqual([]);
  });

  it('gives guests a network hint without admin instructions', () => {
    const msg = errorMessage(new ApiError(0, 'NETWORK', 'Failed to fetch'), { readOnly: true });
    expect(msg.title).toBe('Không kết nối được với máy chủ.');
    expect(msg.hint).toBe('Hãy kiểm tra kết nối mạng rồi thử lại.');
  });

  it('explains network failures', () => {
    expect(errorMessage(new ApiError(0, 'NETWORK', 'Failed to fetch')).title)
      .toContain('Cannot reach the server');
  });

  it('explains the Vietsub editor errors', () => {
    expect(errorMessage(new ApiError(409, 'VIETSUB_CHANGED', 'x'))).toEqual({
      title: 'This Vietsub changed since you opened it.',
      hint: 'Reload to see the latest version.',
    });
    expect(errorMessage(new ApiError(400, 'INVALID_VIETSUB_TEXT', 'x')).title).toBe('Check the highlighted lines.');
    expect(errorMessage(new ApiError(404, 'NO_VIETSUB', 'x')).title).toContain('no Vietsub');
  });

  it('falls back to the HTTP status when there is no known code', () => {
    expect(errorMessage(new ApiError(405, null, 'Method not allowed')).title).toContain('HTTP 405');
  });

  it('handles non-API errors', () => {
    expect(errorMessage(new Error('boom')).title).toContain('Something went wrong');
  });
});
