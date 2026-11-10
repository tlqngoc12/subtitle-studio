import { beforeEach, describe, expect, it, vi } from 'vitest';

// The Pages Functions are generated into the Cloudflare deploy at Publish; they live in the backend resources.
type Env = { READS: unknown; ASSETS: { fetch: (url: URL) => Promise<Response> } };

/** A tiny in-memory stand-in for D1: only the statements the functions use. */
function fakeD1() {
  const rows = new Map<string, number>();
  const statements: string[] = [];
  const db = {
    rows,
    statements,
    prepare(sql: string) {
      statements.push(sql);
      let args: unknown[] = [];
      const stmt = {
        bind(...a: unknown[]) {
          args = a;
          return stmt;
        },
        async run() {
          if (sql.startsWith('INSERT')) rows.set(String(args[0]), (rows.get(String(args[0])) ?? 0) + 1);
          return {};
        },
        async all() {
          return { results: [...rows].map(([slug, reads]) => ({ slug, reads })) };
        },
      };
      return stmt;
    },
  };
  return db;
}

async function load() {
  vi.resetModules();
  // @ts-expect-error plain JS shipped to Cloudflare, no type declarations
  const get = await import('../../src/main/resources/public-functions/reads-get.js');
  // @ts-expect-error plain JS shipped to Cloudflare, no type declarations
  const post = await import('../../src/main/resources/public-functions/reads-post.js');
  return { get: get.onRequestGet, post: post.onRequestPost };
}

describe('read-count Pages Functions', () => {
  let db: ReturnType<typeof fakeD1>;
  let env: Env;

  beforeEach(() => {
    db = fakeD1();
    env = {
      READS: db,
      ASSETS: { fetch: async () => new Response(JSON.stringify([{ slug: 'my-novel' }, { slug: 'other' }])) },
    };
  });

  const call = (slug: string) => ({ env, request: new Request('https://x.pages.dev/api/reads/' + slug, { method: 'POST' }), params: { slug } });

  it('counts a published novel and answers 204', async () => {
    const { post } = await load();

    expect((await post(call('my-novel'))).status).toBe(204);
    expect((await post(call('my-novel'))).status).toBe(204);

    expect(db.rows.get('my-novel')).toBe(2);
    expect(db.statements[0]).toMatch(/CREATE TABLE IF NOT EXISTS novel_reads/);
  });

  it('answers 404 for a malformed slug or a novel that is not published, and counts nothing', async () => {
    const { post } = await load();

    expect((await post(call('Bad_Slug'))).status).toBe(404);
    expect((await post(call('a'.repeat(101)))).status).toBe(404);
    expect((await post(call('unknown'))).status).toBe(404);
    expect(db.rows.size).toBe(0);
  });

  it('does not count when the novel list cannot be read', async () => {
    env.ASSETS.fetch = async () => new Response('nope', { status: 500 });
    const { post } = await load();

    expect((await post(call('my-novel'))).status).toBe(503);
    expect(db.rows.size).toBe(0);
  });

  it('GET returns every count as JSON, cacheable for a minute', async () => {
    db.rows.set('my-novel', 7);
    const { get } = await load();

    const res = await get({ env } as never);

    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
    expect(await res.json()).toEqual({ 'my-novel': 7 });
  });
});
