import type { Fanfic } from '../api/fanfics';

/** The sample story (396487502) as the API returns it; override fields per test. */
export function fanfic(over: Partial<Fanfic> = {}): Fanfic {
  return {
    id: 1,
    url: 'https://www.wattpad.com/story/396487502',
    title: 'The Way She Warmed Me',
    author: 'emibonnie',
    description: 'Emi never expected the cold winter to end like this.',
    tags: ['gl', 'fluff'],
    coverUrl: '/api/media/9',
    readCount: 51029,
    voteCount: 2167,
    partCount: 28,
    wordCount: 15739,
    readingMinutes: 68,
    completed: true,
    storyUpdatedAt: '2026-11-07T12:15:30Z',
    fetchedAt: '2026-11-11T01:00:00Z',
    createdAt: '2026-11-10T01:00:00Z',
    ...over,
  };
}
