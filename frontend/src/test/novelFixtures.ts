import type {
  ChapterDetail,
  ChapterSummary,
  NotebookView,
  NovelDetail,
  NovelSummary,
} from '../api/novels';

export function novelSummary(over: Partial<NovelSummary> = {}): NovelSummary {
  return {
    id: 3,
    slug: 'summer-love',
    title: 'Tình Yêu Mùa Hạ',
    coverUrl: null,
    novelStatus: 'ONGOING',
    chapterCount: 12,
    publishedCount: 8,
    updatedAt: '2026-11-05T10:00:00Z',
    featured: false,
    createdAt: '2026-11-01T10:00:00Z',
    lastPublishedAt: null,
    originalAuthor: null,
    description: null,
    ...over,
  };
}

export function chapterSummary(over: Partial<ChapterSummary> = {}): ChapterSummary {
  return {
    id: 9,
    chapterNo: 1,
    title: 'Mở đầu',
    label: null,
    translationStatus: 'TRANSLATED',
    translationError: null,
    translationModel: null,
    publishStatus: 'PUBLISHED',
    pageCount: 3,
    suspectPages: 0,
    ...over,
  };
}

export function novelDetail(over: Partial<NovelDetail> = {}): NovelDetail {
  return {
    id: 3,
    slug: 'summer-love',
    title: 'Tình Yêu Mùa Hạ',
    coverMediaId: null,
    coverUrl: null,
    originalAuthor: 'ผู้เขียน',
    description: 'Giới thiệu',
    tags: ['romance', 'BL'],
    novelStatus: 'ONGOING',
    translatorCredit: 'Dịch: @byZenQN',
    sourceUrl: 'https://example.com/book',
    promptProfile: 'SummerLove',
    trailerVideoId: null,
    sourceType: 'SCREENSHOTS',
    sourceLanguage: 'th',
    wattpadStoryId: null,
    notebookStatus: 'IDLE',
    notebookError: null,
    chapters: [
      chapterSummary(),
      chapterSummary({ id: 10, chapterNo: 2, title: null, translationStatus: 'TRANSLATING', publishStatus: 'DRAFT' }),
    ],
    ...over,
  };
}

export function chapterDetail(over: Partial<ChapterDetail> = {}): ChapterDetail {
  return {
    id: 9,
    novelId: 3,
    novelTitle: 'Tình Yêu Mùa Hạ',
    chapterNo: 1,
    title: 'Mở đầu',
    label: null,
    translationStatus: 'TRANSLATED',
    translationError: null,
    translationModel: null,
    translatedAt: '2026-11-05T10:00:00Z',
    editedAfterTranslation: false,
    publishStatus: 'DRAFT',
    pages: [
      { id: 11, position: 1, mediaUrl: '/api/media/5', textVi: 'Trang một', source: null, landscape: false, suspect: false },
      { id: 12, position: 2, mediaUrl: '/api/media/6', textVi: 'Trang hai', source: null, landscape: false, suspect: false },
    ],
    text: 'Trang một\n\nTrang hai',
    prevChapterId: null,
    nextChapterId: 10,
    sourceText: null,
    wattpadPartId: null,
    sourceFetchedAt: null,
    sourceLanguage: 'th',
    ...over,
  };
}

export function notebookView(over: Partial<NotebookView> = {}): NotebookView {
  return {
    afterChapterNo: 5,
    content: {
      glossary: [{ source: 'พี่ชาย', target: 'anh trai', note: null }],
      addressing: [{ from: 'Mai', to: 'Nam', rule: 'Mai gọi Nam là anh, xưng em' }],
      characters: [
        { name: 'Mai', sourceName: 'ใหม่', profile: 'hiền', currentState: 'đang buồn', lastUpdatedChapter: 5 },
      ],
      storySoFar: 'Mai gặp Nam.',
      recentChapters: [{ chapterNo: 5, summary: 'Nam cứu Mai.' }],
    },
    versions: [2, 5],
    status: 'IDLE',
    error: null,
    staleLaterVersions: false,
    ...over,
  };
}
