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
