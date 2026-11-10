import type { PublicChapterFile, PublicPageFormat } from '../../data/novelTypes';
import type { ReaderSize } from './readerPrefs';

/** Reading column widths in px on desktop, by size step. */
export const READER_COLUMNS = [560, 640, 720] as const;

const COMPACT_KEYS = ['s', 'm', 'l'] as const;

/** The image set to show: on compact screens the size step picks s/m/l, on desktop always s. */
export function pickFormat(chapter: PublicChapterFile, compact: boolean, size: ReaderSize): PublicPageFormat {
  const formats = chapter.formats ?? [];
  const small = formats.find((f) => f.key === 's') ?? { key: 's' as const, width: 1080, height: 1600, images: chapter.images };
  if (!compact) return small;
  return formats.find((f) => f.key === COMPACT_KEYS[size]) ?? small;
}
