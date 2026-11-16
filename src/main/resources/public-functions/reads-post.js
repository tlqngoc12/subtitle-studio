// Pages Function: POST /api/reads/:slug -> counts one chapter opening for a published novel. Generated at Publish.
const CREATE_TABLE = 'CREATE TABLE IF NOT EXISTS novel_reads (slug TEXT PRIMARY KEY, reads INTEGER NOT NULL DEFAULT 0)';
const SLUG = /^[a-z0-9-]{1,100}$/;
const PUBLISHED_TTL_MS = 5 * 60 * 1000;
const DEDUPE_SECONDS = 10 * 60;

let tableReady = false;
let published = null;
let publishedAt = 0;

/** Slugs of the published novels, read from the site's own /data/novels.json and cached for a few minutes. */
async function publishedSlugs(env, request) {
  if (published && Date.now() - publishedAt < PUBLISHED_TTL_MS) return published;
  const res = await env.ASSETS.fetch(new URL('/data/novels.json', request.url));
  if (!res.ok) throw new Error('novels.json unavailable');
  const list = await res.json();
  published = new Set(list.map((novel) => novel.slug));
  publishedAt = Date.now();
  return published;
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A synthetic cache key per (visitor, novel); the IP is hashed so it is never stored. Null when there is no cache. */
async function dedupeKey(request, slug) {
  if (typeof caches === 'undefined') return null;
  const ip = request.headers.get('CF-Connecting-IP') ?? '';
  return new Request('https://reads-dedupe.invalid/' + slug + '/' + (await sha256Hex(ip)));
}

export async function onRequestPost({ env, request, params }) {
  const slug = String(params.slug ?? '');
  if (!SLUG.test(slug)) return new Response(null, { status: 404 });
  try {
    if (!(await publishedSlugs(env, request)).has(slug)) return new Response(null, { status: 404 });
    // Best effort (the cache is per data centre): one opening per visitor and novel per 10 minutes. A cache error never blocks counting.
    let key = null;
    try {
      key = await dedupeKey(request, slug);
      if (key && (await caches.default.match(key))) return new Response(null, { status: 204 });
    } catch {
      // count anyway
    }
    if (!tableReady) {
      await env.READS.prepare(CREATE_TABLE).run();
      tableReady = true;
    }
    await env.READS.prepare('INSERT INTO novel_reads (slug, reads) VALUES (?, 1) ON CONFLICT(slug) DO UPDATE SET reads = reads + 1')
      .bind(slug)
      .run();
    if (key) {
      try {
        await caches.default.put(key, new Response('1', { headers: { 'Cache-Control': 'max-age=' + DEDUPE_SECONDS } }));
      } catch {
        // not counted twice only when the cache works
      }
    }
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 503 });
  }
}
