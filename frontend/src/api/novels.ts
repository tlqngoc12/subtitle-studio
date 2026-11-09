import { send, type PromptProfiles } from './client';

/** Novels API (spec section 6). Field names match the backend records. */

export type NovelStatus = 'ONGOING' | 'COMPLETED';
export type ChapterTranslationStatus = 'NONE' | 'TRANSLATING' | 'TRANSLATED' | 'FAILED';
export type ChapterPublishStatus = 'DRAFT' | 'PUBLISHED';
export type NotebookStatus = 'IDLE' | 'UPDATING' | 'FAILED';

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

export interface NovelDetail extends Omit<NovelInput, 'tags' | 'trailerUrl'> {
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
