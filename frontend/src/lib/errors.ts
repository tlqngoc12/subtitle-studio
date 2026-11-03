import { ApiError } from '../api/client';

export interface ErrorMessage {
  title: string;
  hint?: string;
}

/** Turns an API error into user-facing English copy, keyed by the backend's ProblemDetail `code`. */
export function errorMessage(error: unknown): ErrorMessage {
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
    case 'PROFILE_NOT_FOUND':
      return { title: 'Profile not found.' };
    case 'BLOCK_NOT_FOUND':
      return { title: 'This block no longer exists.', hint: 'Reload the page.' };
    case 'INVALID_BLOCK':
      return { title: 'Some block fields are not valid.' };
    case 'INVALID_MEDIA':
      return { title: 'The file is not a JPEG, PNG, WebP or GIF image.' };
    case 'MEDIA_TOO_LARGE':
      return { title: 'Image too large (10 MB max).' };
    case 'MEDIA_NOT_FOUND':
      return { title: 'Image not found.' };
    case 'NETWORK':
      return { title: 'Cannot reach the server.', hint: 'Check that Subtitle Studio is running.' };
    default:
      return { title: `Something went wrong (HTTP ${error.status}).`, hint: error.detail };
  }
}
