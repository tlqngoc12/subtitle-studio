// Pages Function: GET /api/reads -> { "<slug>": <reads>, ... }. Generated into the site's deploy at Publish.
const CREATE_TABLE = 'CREATE TABLE IF NOT EXISTS novel_reads (slug TEXT PRIMARY KEY, reads INTEGER NOT NULL DEFAULT 0)';

let tableReady = false;

export async function onRequestGet({ env }) {
  try {
    if (!tableReady) {
      await env.READS.prepare(CREATE_TABLE).run();
      tableReady = true;
    }
    const { results } = await env.READS.prepare('SELECT slug, reads FROM novel_reads').all();
    const counts = {};
    for (const row of results ?? []) counts[row.slug] = row.reads;
    return new Response(JSON.stringify(counts), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
    });
  } catch {
    return new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
}
