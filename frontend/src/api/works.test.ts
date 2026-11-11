import { describe, expect, it } from 'vitest';
import { fakeFetch } from '../test/fakeFetch';
import {
  createPerson,
  createWork,
  deletePerson,
  deleteWork,
  getWork,
  listPeople,
  listWorks,
  updatePerson,
  updateWork,
  type WorkInput,
} from './works';

const INPUT: WorkInput = {
  title: 'T',
  coverMediaId: null,
  releaseDate: null,
  categories: ['MUSIC'],
  subcategory: null,
  profile: null,
  description: null,
  links: [],
  credits: [],
};

describe('works api', () => {
  it('calls the work and people endpoints', async () => {
    const calls = fakeFetch([
      { method: 'GET', path: '/api/works', status: 200, body: [] },
      { method: 'GET', path: '/api/works/3', status: 200, body: {} },
      { method: 'POST', path: '/api/works', status: 201, body: {} },
      { method: 'PUT', path: '/api/works/3', status: 200, body: {} },
      { method: 'DELETE', path: '/api/works/3', status: 204 },
      { method: 'GET', path: '/api/people', status: 200, body: [] },
      { method: 'POST', path: '/api/people', status: 201, body: {} },
      { method: 'PUT', path: '/api/people/4', status: 200, body: {} },
      { method: 'DELETE', path: '/api/people/4', status: 204 },
    ]);

    await listWorks();
    await getWork(3);
    await createWork(INPUT);
    await updateWork(3, INPUT);
    await deleteWork(3);
    await listPeople();
    await createPerson({ name: 'Bonnie', avatarMediaId: null });
    await updatePerson(4, { name: 'B', avatarMediaId: 1 });
    await deletePerson(4);

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /api/works',
      'GET /api/works/3',
      'POST /api/works',
      'PUT /api/works/3',
      'DELETE /api/works/3',
      'GET /api/people',
      'POST /api/people',
      'PUT /api/people/4',
      'DELETE /api/people/4',
    ]);
    expect(JSON.parse(String(calls[2].body))).toEqual(INPUT);
  });
});
