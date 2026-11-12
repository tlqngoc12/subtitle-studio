import type { WorkCategory } from '../../api/works';

export const CATEGORY_LABELS: Record<WorkCategory, string> = {
  FILM_TV: 'Film & TV',
  PERFORMANCE: 'Performance',
  MUSIC: 'Music',
  VARIETY: 'Variety Show',
  ADVERTISEMENT: 'Advertisement',
  CEREMONY: 'Ceremony',
  INTERVIEW: 'Interview',
  FASHION: 'Fashion',
};

export const CATEGORIES = Object.keys(CATEGORY_LABELS) as WorkCategory[];

/** Suggestions for the role field; any text is accepted for every category. */
export const ROLE_SUGGESTIONS: Partial<Record<WorkCategory, string[]>> = {
  FILM_TV: ['Lead', 'Supporting', 'Guest', 'Cameo'],
  MUSIC: ['Singer', 'Featuring', 'Vocal', 'MV cast'],
};

/** Fixed subcategory suggestions per category; any text is accepted for every category. */
export const SUBCATEGORY_SUGGESTIONS: Record<WorkCategory, string[]> = {
  FILM_TV: ['Series', 'Movie', 'Short film', 'Special'],
  MUSIC: ['Single', 'OST', 'Album', 'Cover', 'Live'],
  PERFORMANCE: ['Concert', 'Fan meeting', 'Stage'],
  VARIETY: ['Guest', 'Regular', 'Reality'],
  ADVERTISEMENT: ['TVC', 'Print', 'Campaign'],
  CEREMONY: ['Awards', 'Red carpet'],
  INTERVIEW: ['Magazine', 'TV', 'Online'],
  FASHION: ['Runway', 'Photoshoot', 'Event'],
};

/**
 * Subcategory suggestions for the chosen categories: the fixed list of each (in category order), then what other works
 * in those categories already use, without repeats (case-insensitive; the first spelling wins).
 */
export function subcategorySuggestions(categories: WorkCategory[], used: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...CATEGORIES.filter((c) => categories.includes(c)).flatMap((c) => SUBCATEGORY_SUGGESTIONS[c]), ...used]) {
    const key = s.trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(s);
    }
  }
  return out;
}

/** A work is a film when Film & TV is one of its categories (it then has characters). */
export function isFilm(categories: WorkCategory[]): boolean {
  return categories.includes('FILM_TV');
}

/** Role suggestions for every chosen category, without repeats. */
export function roleSuggestions(categories: WorkCategory[]): string[] {
  return [...new Set(categories.flatMap((c) => ROLE_SUGGESTIONS[c] ?? []))];
}

/** Heading of the people section: Cast for a film, Artists for music alone, People otherwise. */
export function peopleHeading(categories: WorkCategory[]): 'Cast' | 'Artists' | 'People' {
  if (isFilm(categories)) return 'Cast';
  if (categories.length === 1 && categories[0] === 'MUSIC') return 'Artists';
  return 'People';
}

/** Vietnamese names of the categories, shown on the public site. */
export const CATEGORY_LABELS_VI: Record<WorkCategory, string> = {
  FILM_TV: 'Phim & TV',
  PERFORMANCE: 'Biểu diễn',
  MUSIC: 'Âm nhạc',
  VARIETY: 'Chương trình giải trí',
  ADVERTISEMENT: 'Quảng cáo',
  CEREMONY: 'Lễ trao giải',
  INTERVIEW: 'Phỏng vấn',
  FASHION: 'Thời trang',
};

/** Heading of the people section on the public site. */
export const PEOPLE_HEADING_VI = { Cast: 'Diễn viên', Artists: 'Nghệ sĩ', People: 'Nhân vật' } as const;

/** A category's name for the current site (Vietnamese when `vi`). */
export function categoryLabel(c: WorkCategory, vi: boolean): string {
  return vi ? CATEGORY_LABELS_VI[c] : CATEGORY_LABELS[c];
}
