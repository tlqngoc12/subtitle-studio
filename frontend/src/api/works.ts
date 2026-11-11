/** Typed client for the Works and People APIs (works spec). */
import { send } from './client';

export type WorkCategory =
  | 'FILM_TV'
  | 'PERFORMANCE'
  | 'MUSIC'
  | 'VARIETY'
  | 'ADVERTISEMENT'
  | 'CEREMONY'
  | 'INTERVIEW'
  | 'FASHION';

export type LinkKind = 'PILOT' | 'TRAILER' | 'X' | 'INSTAGRAM' | 'OTHER';

/** A row of the Works grid. `releaseDate` is `yyyy-mm-dd`, or null for "Coming Soon". */
export interface WorkSummary {
  id: number;
  title: string;
  coverUrl: string | null;
  releaseDate: string | null;
  category: WorkCategory;
  subcategory: string | null;
  /** Profile slug of the badge, or null. */
  profile: string | null;
}

export interface WorkLink {
  kind: LinkKind;
  label: string;
  url: string;
  /** Explicit icon key, or null to detect it from the URL. */
  icon: string | null;
}

export interface Person {
  id: number;
  name: string;
  /** Null on the public site, where only `avatarUrl` is exported. */
  avatarMediaId: number | null;
  avatarUrl: string | null;
}

export interface WorkCredit {
  person: Person;
  role: string | null;
  characterName: string | null;
}

export interface Work extends WorkSummary {
  /** Null on the public site. */
  coverMediaId: number | null;
  description: string | null;
  links: WorkLink[];
  credits: WorkCredit[];
  /** The 11-character YouTube id of the TRAILER link, when it is a YouTube link. */
  trailerVideoId: string | null;
}

export interface WorkInput {
  title: string;
  coverMediaId: number | null;
  releaseDate: string | null;
  category: WorkCategory;
  subcategory: string | null;
  profile: string | null;
  description: string | null;
  links: WorkLink[];
  credits: { personId: number; role: string | null; characterName: string | null }[];
}

export interface PersonInput {
  name: string;
  avatarMediaId: number | null;
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function listWorks(): Promise<WorkSummary[]> {
  return (await send('/api/works')).json();
}

export async function getWork(id: number): Promise<Work> {
  return (await send(`/api/works/${id}`)).json();
}

export async function createWork(input: WorkInput): Promise<Work> {
  return (await send('/api/works', json('POST', input))).json();
}

export async function updateWork(id: number, input: WorkInput): Promise<Work> {
  return (await send(`/api/works/${id}`, json('PUT', input))).json();
}

export async function deleteWork(id: number): Promise<void> {
  await send(`/api/works/${id}`, { method: 'DELETE' });
}

export async function listPeople(): Promise<Person[]> {
  return (await send('/api/people')).json();
}

export async function createPerson(input: PersonInput): Promise<Person> {
  return (await send('/api/people', json('POST', input))).json();
}

export async function updatePerson(id: number, input: PersonInput): Promise<Person> {
  return (await send(`/api/people/${id}`, json('PUT', input))).json();
}

export async function deletePerson(id: number): Promise<void> {
  await send(`/api/people/${id}`, { method: 'DELETE' });
}
