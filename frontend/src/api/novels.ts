import { afterTranslateStart } from '../lib/geminiQuota';
import { send, type PromptProfiles } from './client';

/** Novels API (spec section 6). Field names match the backend records. */

export type NovelStatus = 'ONGOING' | 'COMPLETED';
export type ChapterTranslationStatus = 'NONE' | 'TRANSLATING' | 'TRANSLATED' | 'FAILED';
export type ChapterPublishStatus = 'DRAFT' | 'PUBLISHED';
/** ORIGINAL: the owner's own story, written chapter by chapter (no translation). */
export type NovelSourceType = 'SCREENSHOTS' | 'WATTPAD' | 'ORIGINAL';
/** The language of a novel's original text (vi only for an ORIGINAL story). */
export type SourceLanguage = 'th' | 'en' | 'es' | 'vi';

export interface NovelInput {
  slug: string;
  title: string;
  coverMediaId: number | null;
  originalAuthor: string | null;
  description: string | null;
  tags: string[];
  novelStatus: NovelStatus;
  translatorCredit: string | null;
  sourceUrl: string | null;
  promptProfile: string | null;
  /** A YouTube link of any common form; the server stores only its 11-character video id. Null clears it. */
  trailerUrl: string | null;
  /** Where chapters come from; only used when creating (default SCREENSHOTS). */
  sourceType?: NovelSourceType;
  sourceLanguage?: SourceLanguage;
  /** Wattpad novels: the story id, and (create only) the story's cover to download. */
  wattpadStoryId?: string | null;
  coverUrl?: string | null;
  /** Original stories: an optional Wattpad story link (https://www.wattpad.com/story/<id>); null removes it. */
  wattpadUrl?: string | null;
}

export interface NovelSummary {
  id: number;
  slug: string;
  title: string;
  coverUrl: string | null;
  novelStatus: NovelStatus;
  chapterCount: number;
  publishedCount: number;
  updatedAt: string;
  /** Set for novels translated from Wattpad. */
  wattpadStoryId?: string | null;
  /** Where its chapters come from; ORIGINAL novels have their own tab. */
  sourceType: NovelSourceType;
  /** Picked for the public banner (at most 5). */
  featured: boolean;
  createdAt: string;
  /** Latest publish time of its published chapters; null when none. */
  lastPublishedAt: string | null;
  originalAuthor: string | null;
  description: string | null;
  /** The same tags as the detail; the novel form suggests them. */
  tags: string[];
}

export interface ChapterSummary {
  id: number;
  chapterNo: number;
  /** Original stories: when the chapter was last synced from Wattpad; null when it never was (or not an original). */
  lastSyncedAt: string | null;
  /** Original stories: the part's modification date on Wattpad in the synced version; null when unknown. */
  wattpadModifiedAt: string | null;
  /** The chapter's name everywhere ("Chương 7: Bữa cơm hai người", "Ngoại truyện I"). */
  title: string;
  translationStatus: ChapterTranslationStatus;
  translationError: string | null;
  /** Gemini model(s) translating now, or that translated it; null = unknown. */
  translationModel: string | null;
  publishStatus: ChapterPublishStatus;
  pageCount: number;
  /** Pages whose translation looks much shorter than the Thai text read from the image. */
  suspectPages: number;
  /** True when a fallback model (not the main one) translated it, so it may be worth translating again. */
  translatedByFallback: boolean;
}

export interface NovelDetail extends Omit<NovelInput, 'tags' | 'trailerUrl' | 'sourceType' | 'sourceLanguage' | 'wattpadStoryId' | 'coverUrl' | 'wattpadUrl'> {
  sourceType: NovelSourceType;
  sourceLanguage: SourceLanguage;
  wattpadStoryId: string | null;
  id: number;
  /** The stored trailer's YouTube video id, or null. */
  trailerVideoId: string | null;
  tags: string[];
  coverUrl: string | null;
  chapters: ChapterSummary[];
}

export interface PageDto {
  id: number;
  position: number;
  mediaUrl: string;
  textVi: string | null;
  /** The Thai text Gemini read from the image; null when unknown. */
  source: string | null;
  /** The photo is wider than tall (probably sideways). */
  landscape: boolean;
  /** The translation is much shorter than its source. */
  suspect: boolean;
}

export type RotateDirection = 'LEFT' | 'RIGHT';

export interface ChapterDetail {
  id: number;
  novelId: number;
  novelTitle: string;
  chapterNo: number;
  title: string;
  translationStatus: ChapterTranslationStatus;
  translationError: string | null;
  /** Gemini model(s) translating now, or that translated it; null = unknown. */
  translationModel: string | null;
  /** True when a fallback model (not the main one) translated it, so it may be worth translating again. */
  translatedByFallback: boolean;
  translatedAt: string | null;
  editedAfterTranslation: boolean;
  publishStatus: ChapterPublishStatus;
  pages: PageDto[];
  /** The whole chapter's text: the edited one, or the page texts joined with a blank line. */
  text: string;
  prevChapterId: number | null;
  nextChapterId: number | null;
  /** The original text of a Wattpad chapter (no pages); null for screenshot chapters. */
  sourceText: string | null;
  wattpadPartId: string | null;
  sourceFetchedAt: string | null;
  /** Language of the original text of the novel (th or en). */
  sourceLanguage: SourceLanguage;
  /** Images a Wattpad fetch could not download (only set by the fetch and reload calls). */
  skippedImages?: number;
  /** The novel's kind; ORIGINAL chapters are written by hand and are never translated. */
  sourceType: NovelSourceType;
  /** An ORIGINAL chapter whose novel has a Wattpad link: the chapter page offers Sync from Wattpad. */
  wattpadLinked: boolean;
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

/** Translation profiles for novels (./data/prompts/novels), separate from the Vietsub ones. */
export async function getNovelProfiles(): Promise<PromptProfiles> {
  return (await send('/api/novel-profiles')).json();
}

export async function listNovels(): Promise<NovelSummary[]> {
  return (await send('/api/novels')).json();
}

/** Read totals per novel slug from the published site; {} when read counts are off or cannot be fetched. */
/** Picks or unpicks a novel for the public banner; the server refuses a sixth pick (BANNER_FULL). */
export async function setNovelFeatured(id: number, featured: boolean): Promise<NovelSummary> {
  return (await send(`/api/novels/${id}/featured`, json('PUT', { featured }))).json();
}

export async function listNovelReads(): Promise<Record<string, number>> {
  try {
    return await (await send('/api/novels/reads')).json();
  } catch {
    return {};
  }
}

export async function getNovel(id: number): Promise<NovelDetail> {
  return (await send(`/api/novels/${id}`)).json();
}

export async function createNovel(input: NovelInput): Promise<NovelDetail> {
  return (await send('/api/novels', json('POST', input))).json();
}

export async function updateNovel(id: number, input: NovelInput): Promise<NovelDetail> {
  return (await send(`/api/novels/${id}`, json('PUT', input))).json();
}

export async function deleteNovel(id: number): Promise<void> {
  await send(`/api/novels/${id}`, { method: 'DELETE' });
}

export async function addChapter(novelId: number, input: { title?: string }): Promise<ChapterDetail> {
  return (await send(`/api/novels/${novelId}/chapters`, json('POST', input))).json();
}

export async function getChapter(id: number): Promise<ChapterDetail> {
  return (await send(`/api/chapters/${id}`)).json();
}

/** The newest review file of a chapter of an original story; throws `ApiError` (code REVIEW_NOT_FOUND on 404). */
export async function getChapterReview(id: number): Promise<{ fileName: string; markdown: string }> {
  return (await send(`/api/chapters/${id}/review`)).json();
}

export async function updateChapter(
  id: number,
  input: {
    title?: string;
    pages?: { id: number; textVi: string }[];
    text?: string;
  },
): Promise<ChapterDetail> {
  return (await send(`/api/chapters/${id}`, json('PUT', input))).json();
}

export async function deleteChapter(id: number): Promise<void> {
  await send(`/api/chapters/${id}`, { method: 'DELETE' });
}

export async function uploadPages(id: number, files: File[]): Promise<PageDto[]> {
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  return (await send(`/api/chapters/${id}/pages`, { method: 'POST', body: form })).json();
}

export async function reorderPages(id: number, pageIds: number[]): Promise<PageDto[]> {
  return (await send(`/api/chapters/${id}/pages/order`, json('PUT', { pageIds }))).json();
}

/** Sets the reading order of a novel's chapters (chapter numbers never change). */
export async function reorderChapters(novelId: number, chapterIds: number[]): Promise<ChapterSummary[]> {
  return (await send(`/api/novels/${novelId}/chapters/order`, json('PUT', { chapterIds }))).json();
}

/** Downloads every chapter that has text as a zip (.md + paste-ready .html each); 409 NOTHING_TO_EXPORT when none has. */
export async function exportNovel(id: number): Promise<{ blob: Blob; fileName: string }> {
  const res = await send(`/api/novels/${id}/export`);
  const match = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') ?? '');
  return { blob: await res.blob(), fileName: match ? match[1] : `novel-${id}.zip` };
}

/** One chapter as a zip (.md + .html); 409 NOTHING_TO_EXPORT when it has no text. */
export async function exportChapter(id: number): Promise<{ blob: Blob; fileName: string }> {
  const res = await send(`/api/chapters/${id}/export`);
  const match = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') ?? '');
  return { blob: await res.blob(), fileName: match ? match[1] : `chapter-${id}.zip` };
}

export async function deletePage(id: number, pageId: number): Promise<void> {
  await send(`/api/chapters/${id}/pages/${pageId}`, { method: 'DELETE' });
}

export async function rotatePage(id: number, pageId: number, direction: RotateDirection): Promise<PageDto[]> {
  return (await send(`/api/chapters/${id}/pages/${pageId}/rotate`, json('POST', { direction }))).json();
}

export async function rotatePages(id: number, direction: RotateDirection): Promise<PageDto[]> {
  return (await send(`/api/chapters/${id}/pages/rotate`, json('POST', { direction }))).json();
}

export async function translateChapter(id: number): Promise<ChapterDetail> {
  return (await afterTranslateStart(send(`/api/chapters/${id}/translate`, { method: 'POST' }))).json();
}

export async function publishChapter(id: number): Promise<ChapterDetail> {
  return (await send(`/api/chapters/${id}/publish`, { method: 'POST' })).json();
}

export async function unpublishChapter(id: number): Promise<ChapterDetail> {
  return (await send(`/api/chapters/${id}/unpublish`, { method: 'POST' })).json();
}

/** What the New novel form is prefilled with from a Wattpad story (nothing is saved). */
export interface WattpadNovelPreview {
  storyId: string;
  title: string;
  author: string | null;
  description: string | null;
  tags: string[];
  completed: boolean;
  languageName: string | null;
  /** Guessed from Wattpad's language name: Thai gives th, anything else en. */
  sourceLanguage: SourceLanguage;
  partCount: number;
  coverUrl: string | null;
  storyUrl: string;
  /** The id of the novel that already uses this story, if any. */
  existingNovelId: number | null;
  /** The story's parts in story order (read-only here). */
  parts: WattpadPreviewPart[];
  /** The profile file name (without .md) created when the Translation profile is left empty on Create. */
  suggestedProfile: string;
}

export interface WattpadPreviewPart {
  partId: string;
  title: string;
  wordCount: number;
  modifiedAt: string | null;
  deleted: boolean;
}

export interface WattpadPart {
  partId: string;
  title: string;
  wordCount: number;
  createdAt: string | null;
  modifiedAt: string | null;
  deleted: boolean;
  /** The chapter this part was imported as; null until imported. */
  importedChapterId: number | null;
}

export interface WattpadImportResult {
  imported: { partId: string; chapterId: number; skippedImages?: number }[];
  skipped: string[];
  failed: { partId: string; title: string; reason: string }[];
}

export async function previewWattpadNovel(url: string): Promise<WattpadNovelPreview> {
  return (await send('/api/novels/wattpad/preview', json('POST', { url }))).json();
}

/** The story's parts in story order (one request to Wattpad). */
export async function listWattpadParts(novelId: number): Promise<WattpadPart[]> {
  return (await send(`/api/novels/${novelId}/wattpad/parts`)).json();
}

/** Imports the chosen parts as Draft chapters; can take a while (about half a second per part). */
export async function importWattpadParts(novelId: number, partIds: string[]): Promise<WattpadImportResult> {
  return (await send(`/api/novels/${novelId}/wattpad/import`, json('POST', { partIds }))).json();
}

/** Fetches one part (unless already a chapter) and starts its translation; one chapter at a time per novel. */
export async function fetchAndTranslateWattpadPart(novelId: number, partId: string): Promise<ChapterDetail> {
  return (
    await afterTranslateStart(
      send(`/api/novels/${novelId}/wattpad/parts/${encodeURIComponent(partId)}/fetch-translate`, {
        method: 'POST',
      }),
    )
  ).json();
}

/**
 * Starts the next untranslated Wattpad part (the one the Wattpad tab marks Next), fetching it first if it is not a
 * chapter yet. Resolves to the chapter that is now translating.
 */
export async function fetchTranslateNext(novelId: number): Promise<ChapterDetail> {
  return (
    await afterTranslateStart(send(`/api/novels/${novelId}/wattpad/next/fetch-translate`, { method: 'POST' }))
  ).json();
}

/** Fetches the chapter's original text from Wattpad again (Draft chapters only); the translation is untouched. */
export async function reloadChapterOriginal(chapterId: number): Promise<ChapterDetail> {
  return (await send(`/api/chapters/${chapterId}/reload-original`, { method: 'POST' })).json();
}

/** Replaces a Draft chapter's text with one Wattpad part of its novel's linked story (title and status stay). */
export async function syncChapterFromWattpad(chapterId: number, partId: string): Promise<ChapterDetail> {
  return (await send(`/api/chapters/${chapterId}/wattpad-sync`, json('POST', { partId }))).json();
}
