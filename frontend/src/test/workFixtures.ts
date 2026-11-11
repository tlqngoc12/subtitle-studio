import type { Person, Work, WorkSummary } from '../api/works';

export function workSummary(id: number, overrides: Partial<WorkSummary> = {}): WorkSummary {
  return {
    id,
    title: `Work ${id}`,
    coverUrl: null,
    releaseDate: '2026-11-09',
    category: 'FILM_TV',
    subcategory: null,
    profile: null,
    ...overrides,
  };
}

export function person(id: number, name: string, overrides: Partial<Person> = {}): Person {
  return { id, name, avatarMediaId: null, avatarUrl: null, ...overrides };
}

export function work(id: number, overrides: Partial<Work> = {}): Work {
  return {
    ...workSummary(id),
    coverMediaId: null,
    description: null,
    links: [],
    credits: [],
    trailerVideoId: null,
    ...overrides,
  };
}
