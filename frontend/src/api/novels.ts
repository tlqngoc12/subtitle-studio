import { send, type PromptProfiles } from './client';

/** Novels API (spec section 6). Field names match the backend records. */

export type NovelStatus = 'ONGOING' | 'COMPLETED';
export type ChapterTranslationStatus = 'NONE' | 'TRANSLATING' | 'TRANSLATED' | 'FAILED';
export type ChapterPublishStatus = 'DRAFT' | 'PUBLISHED';
export type NotebookStatus = 'IDLE' | 'UPDATING' | 'FAILED';
export type NovelSourceType = 'SCREENSHOTS' | 'WATTPAD';
/** The language of a novel's original text. */
export type SourceLanguage = 'th' | 'en';

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
}

export interface ChapterSummary {
  id: number;
  chapterNo: number;
  title: string | null;
  /** Shown instead of "Chapter N" (e.g. "Ngoại truyện 1"). */
  label: string | null;
  translationStatus: ChapterTranslationStatus;
  translationError: string | null;
  /** Gemini model(s) translating now, or that translated it; null = unknown. */
  translationModel: string | null;
  publishStatus: ChapterPublishStatus;
  pageCount: number;
  /** Pages whose translation looks much shorter than the Thai text read from the image. */
  suspectPages: number;
}

export interface NovelDetail extends Omit<NovelInput, 'tags' | 'trailerUrl' | 'sourceType' | 'sourceLanguage' | 'wattpadStoryId' | 'coverUrl'> {
  sourceType: NovelSourceType;
  sourceLanguage: SourceLanguage;
  wattpadStoryId: string | null;
  id: number;
  /** The stored trailer's YouTube video id, or null. */
  trailerVideoId: string | null;
  tags: string[];
  coverUrl: string | null;
  notebookStatus: NotebookStatus;
  notebookError: string | null;
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
  title: string | null;
  label: string | null;
  translationStatus: ChapterTranslationStatus;
  translationError: string | null;
  /** Gemini model(s) translating now, or that translated it; null = unknown. */
  translationModel: string | null;
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
}

export interface GlossaryEntry {
  source: string;
  target: string;
  note: string | null;
}

export interface AddressingRule {
  from: string;
  to: string;
  rule: string;
}

export interface NotebookCharacter {
  name: string;
  sourceName: string | null;
  profile: string | null;
  currentState: string | null;
  lastUpdatedChapter: number;
}

export interface NotebookContent {
  glossary: GlossaryEntry[];
  addressing: AddressingRule[];
  characters: NotebookCharacter[];
  storySoFar: string;
  recentChapters: { chapterNo: number; summary: string }[];
}

export interface NotebookView {
  afterChapterNo: number | null;
  content: NotebookContent | null;
  versions: number[];
  status: NotebookStatus;
  error: string | null;
  staleLaterVersions: boolean;
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

export async function addChapter(novelId: number, input: { chapterNo?: number; title?: string }): Promise<ChapterDetail> {
  return (await send(`/api/novels/${novelId}/chapters`, json('POST', input))).json();
}

export async function getChapter(id: number): Promise<ChapterDetail> {
  return (await send(`/api/chapters/${id}`)).json();
}

export async function updateChapter(
  id: number,
  input: {
    chapterNo?: number;
    label?: string;
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
  return (await send(`/api/chapters/${id}/translate`, { method: 'POST' })).json();
}

export async function publishChapter(id: number): Promise<ChapterDetail> {
  return (await send(`/api/chapters/${id}/publish`, { method: 'POST' })).json();
}

export async function unpublishChapter(id: number): Promise<ChapterDetail> {
  return (await send(`/api/chapters/${id}/unpublish`, { method: 'POST' })).json();
}

export async function getNotebook(novelId: number, after?: number): Promise<NotebookView> {
  const query = after === undefined ? '' : `?after=${after}`;
  return (await send(`/api/novels/${novelId}/notebook${query}`)).json();
}

export async function retryNotebook(novelId: number): Promise<void> {
  await send(`/api/novels/${novelId}/notebook/retry`, { method: 'POST' });
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
  imported: { partId: string; chapterId: number }[];
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
    await send(`/api/novels/${novelId}/wattpad/parts/${encodeURIComponent(partId)}/fetch-translate`, {
      method: 'POST',
    })
  ).json();
}

/** Fetches the chapter's original text from Wattpad again (Draft chapters only); the translation is untouched. */
export async function reloadChapterOriginal(chapterId: number): Promise<ChapterDetail> {
  return (await send(`/api/chapters/${chapterId}/reload-original`, { method: 'POST' })).json();
}
