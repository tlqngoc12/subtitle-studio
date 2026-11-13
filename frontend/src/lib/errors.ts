import { ApiError } from '../api/client';

export interface ErrorMessage {
  title: string;
  hint?: string;
}

/** What a guest of the public site sees: Vietnamese, and only the errors reading can cause. */
function publicErrorMessage(error: unknown): ErrorMessage {
  if (!(error instanceof ApiError)) return { title: 'Đã xảy ra lỗi.' };
  switch (error.code) {
    case 'NETWORK':
      return { title: 'Không kết nối được với máy chủ.', hint: 'Hãy kiểm tra kết nối mạng rồi thử lại.' };
    case 'VIDEO_NOT_FOUND':
      return { title: 'Không tìm thấy video này.', hint: 'Có thể video đã bị gỡ. Hãy quay lại danh sách Vietsub.' };
    case 'PLAYLIST_NOT_FOUND':
      return { title: 'Không tìm thấy danh sách phát này.' };
    case 'PROFILE_NOT_FOUND':
      return { title: 'Không tìm thấy hồ sơ.' };
    case 'WORK_NOT_FOUND':
      return { title: 'Không tìm thấy tác phẩm.' };
    case 'NOVEL_NOT_FOUND':
      return { title: 'Không tìm thấy truyện này.' };
    case 'CHAPTER_NOT_FOUND':
      return { title: 'Không tìm thấy chương này.' };
    case 'INTERNAL_ERROR':
      return { title: 'Máy chủ gặp lỗi.', hint: 'Hãy thử lại sau.' };
    default:
      return { title: `Đã xảy ra lỗi (HTTP ${error.status}).` };
  }
}

/** Turns an API error into user-facing English copy, keyed by the backend's ProblemDetail `code`. */
/** `readOnly`: the reader is a guest on the public site, so hints never mention running the app. */
export function errorMessage(error: unknown, { readOnly = false }: { readOnly?: boolean } = {}): ErrorMessage {
  if (readOnly) return publicErrorMessage(error);
  if (!(error instanceof ApiError)) {
    return { title: 'Something went wrong.', hint: error instanceof Error ? error.message : undefined };
  }
  switch (error.code) {
    case 'INVALID_URL':
      return {
        title: 'Invalid link.',
        hint: 'Paste a link like youtube.com/watch?v=…, youtu.be/…, youtube.com/shorts/… or an 11-character video ID.',
      };
    case 'NO_ENGLISH_SUBTITLE':
      return {
        title: 'This video has no English subtitles.',
        hint: 'There are neither uploaded nor auto-generated English subtitles.',
      };
    case 'YTDLP_FAILED':
      return { title: 'Could not get subtitles from YouTube.', hint: error.detail };
    case 'YTDLP_TIMEOUT':
      return { title: 'YouTube took too long to respond.', hint: 'Try again in a few minutes.' };
    case 'VIDEO_NOT_FOUND':
      return {
        title: 'This video is no longer in the list.',
        hint: 'It may have been deleted. Reload the page to update the list.',
      };
    case 'INTERNAL_ERROR':
      return { title: 'The server ran into an error.', hint: 'See the application log for details.' };
    case 'INVALID_SRT':
      return {
        title: 'Could not read the .srt file. Check that it is a SubRip file saved as UTF-8.',
        hint: error.detail,
      };
    case 'FILE_TOO_LARGE':
      return { title: 'File too large (5 MB max).' };
    case 'GEMINI_NOT_CONFIGURED':
      return { title: 'Gemini is not set up.', hint: 'Set GEMINI_API_KEY in .env and restart the app.' };
    case 'UNKNOWN_PROFILE':
      return {
        title: 'This translation profile does not exist or cannot be used.',
        hint: 'Check the file in ./data/prompts (UTF-8, 20 KB max).',
      };
    case 'VIDEO_TOO_LONG':
      return { title: 'The video is longer than 60 minutes, so it cannot be translated automatically.' };
    case 'VIETSUB_MANUAL':
      return {
        title: 'This video already has an uploaded Vietsub.',
        hint: 'Delete the uploaded Vietsub on the Vietsub page to translate with Gemini.',
      };
    case 'TRANSLATION_IN_PROGRESS':
      return { title: 'This is already being translated.', hint: 'Wait until the translation finishes.' };
    case 'VIETSUB_CHANGED':
      return { title: 'This Vietsub changed since you opened it.', hint: 'Reload to see the latest version.' };
    case 'VIETSUB_NOT_MANUAL':
      return { title: 'Only a Vietsub that has been edited or uploaded by hand can be marked as done.', hint: 'Save an edit first.' };
    case 'INVALID_VIETSUB_TEXT':
      return { title: 'Check the highlighted lines.' };
    case 'NO_VIETSUB':
      return { title: 'This video has no Vietsub yet.' };
    case 'NOVEL_NOT_FOUND':
      return { title: 'This novel no longer exists.', hint: 'It may have been deleted. Reload the page.' };
    case 'CHAPTER_NOT_FOUND':
      return { title: 'This chapter no longer exists.', hint: 'It may have been deleted. Reload the page.' };
    case 'PAGE_NOT_FOUND':
      return { title: 'This page no longer exists.', hint: 'Reload the page.' };
    case 'INVALID_NOVEL':
      return { title: 'Check the highlighted fields.' };
    case 'INVALID_CHAPTER':
      return { title: 'Check the chapter number and title.' };
    case 'DUPLICATE_NOVEL_SLUG':
      return { title: 'Another novel already uses this slug.' };
    case 'DUPLICATE_CHAPTER_NUMBER':
      return { title: 'This novel already has a chapter with that number.' };
    case 'INVALID_PAGE_ORDER':
      return { title: 'The pages changed meanwhile. They have been reloaded.' };
    case 'CHAPTER_HAS_NO_PAGES':
      return { title: 'Add page screenshots before translating.' };
    case 'CHAPTER_PUBLISHED':
      return {
        title: 'This chapter is published.',
        hint: 'Only its text can be edited. Unpublish it to change pages or translate again.',
      };
    case 'CHAPTER_TEXT_SOURCE':
      return { title: 'This chapter comes from Wattpad text, so it has no pages.' };
    case 'NOVEL_TRANSLATION_BUSY':
      return {
        title: 'Another chapter is still translating',
        hint: 'Wait for it (and the notebook update) to finish.',
      };
    case 'CHAPTER_ALREADY_TRANSLATED':
      return { title: 'This chapter is already translated.', hint: 'Use Translate again on the chapter page.' };
    case 'WATTPAD_PART_DELETED':
      return { title: 'This part was deleted on Wattpad.' };
    case 'WATTPAD_PART_EMPTY':
      return { title: 'Wattpad has no text for this part (locked, empty or removed).' };
    case 'WATTPAD_PART_NOT_FOUND':
      return { title: 'This part is not in the story.' };
    case 'NOVEL_NOT_WATTPAD':
      return { title: 'This novel does not come from Wattpad.' };
    case 'NOVEL_WATTPAD_EXISTS':
      return { title: error.detail || 'This Wattpad story is already translated.', hint: 'Open that novel instead.' };
    case 'CHAPTER_NOT_TRANSLATED':
      return { title: 'Every page needs a translation before publishing.' };
    case 'NOTEBOOK_UPDATE_IN_PROGRESS':
      return { title: 'The notebook is being updated.', hint: 'Try again when it is done.' };
    case 'PUBLISH_IN_PROGRESS':
      return { title: 'A publish is already running.' };
    case 'PUBLISH_NOT_CONFIGURED':
      return {
        title: 'Publishing is not set up.',
        hint: 'Set CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID and SUBTITLESTUDIO_PUBLISH_PROJECT in .env and restart the app.',
      };
    case 'PROFILE_NOT_FOUND':
      return { title: 'Profile not found.' };
    case 'BLOCK_NOT_FOUND':
      return { title: 'This block no longer exists.', hint: 'Reload the page.' };
    case 'BANNER_IMAGE_NOT_FOUND':
      return { title: 'This banner image no longer exists.', hint: 'Reload the page.' };
    case 'INVALID_BLOCK':
      return { title: 'Some block fields are not valid.' };
    case 'INVALID_MEDIA':
      return { title: 'The file is not a JPEG, PNG, WebP or GIF image.' };
    case 'MEDIA_TOO_LARGE':
      return { title: 'Image too large (10 MB max).' };
    case 'MEDIA_NOT_FOUND':
      return { title: 'Image not found.' };
    case 'PLAYLIST_NOT_FOUND':
      return { title: 'This playlist no longer exists.', hint: 'It may have been deleted. Reload the page.' };
    case 'INVALID_PLAYLIST':
      return { title: 'Check the playlist name and description.' };
    case 'VIDEO_HAS_NO_VIETSUB':
      return { title: 'Only videos with Vietsub can be added to a playlist.' };
    case 'INVALID_PLAYLIST_ORDER':
      return { title: 'The playlist changed meanwhile. It has been reloaded.' };
    case 'NO_CORRECTIONS':
      return { title: 'No corrected lines yet.', hint: 'Finish and correct a few Vietsub videos with this profile first.' };
    case 'ANALYSIS_INVALID':
      return { title: 'Gemini returned an unusable profile.', hint: 'Try Analyze again.' };
    case 'GEMINI_FAILED':
      return { title: 'Gemini could not finish the analysis.', hint: error.detail };
    case 'PROFILE_CHANGED':
      return {
        title: 'The file changed on disk since you opened it.',
        hint: 'Reload and analyze again.',
      };
    case 'INVALID_PROFILE_TEXT':
      return { title: 'The profile text is empty or larger than 20 KB.' };
    case 'INVALID_FANFIC_LINK':
      return { title: error.detail || 'Paste a Wattpad story link (wattpad.com/story/…).' };
    case 'FANFIC_NOT_FOUND':
      return { title: 'Story not found or not public.' };
    case 'FANFIC_EXISTS':
      return { title: error.detail || 'This story is already added.' };
    case 'WATTPAD_UNAVAILABLE':
      return { title: 'Wattpad did not answer. Try again later.' };
    case 'NETWORK':
      return {
        title: 'Cannot reach the server.',
        hint: readOnly ? 'Check your internet connection and try again.' : 'Check that Subtitle Studio is running.',
      };
    default:
      return { title: `Something went wrong (HTTP ${error.status}).`, hint: error.detail };
  }
}
