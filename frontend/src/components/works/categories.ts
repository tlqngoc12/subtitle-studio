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

/** Heading of the people section on a work's page. */
export function peopleHeading(category: WorkCategory): 'Cast' | 'Artists' | 'People' {
  if (category === 'FILM_TV') return 'Cast';
  if (category === 'MUSIC') return 'Artists';
  return 'People';
}
