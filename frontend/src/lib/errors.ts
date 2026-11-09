import { ApiError } from '../api/client';

export interface ErrorMessage {
  title: string;
  hint?: string;
}

/** Turns an API error into user-facing English copy, keyed by the backend's ProblemDetail `code`. */
/** `readOnly`: the reader is a guest on the public site, so hints never mention running the app. */
export function errorMessage(error: unknown, { readOnly = false }: { readOnly?: boolean } = {}): ErrorMessage {
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
    case 'NETWORK':
      return {
        title: 'Cannot reach the server.',
        hint: readOnly ? 'Check your internet connection and try again.' : 'Check that Subtitle Studio is running.',
      };
    default:
      return { title: `Something went wrong (HTTP ${error.status}).`, hint: error.detail };
  }
}
