// Pages Function: GET/HEAD /novel-images/<slug>/<file> -> the chapter image stored in the R2 bucket bound as NOVEL_IMAGES.
// Generated into the site's deploy at Publish. Object keys are "novel-images/<slug>/<file>".
const PREFIX = 'novel-images/';

function notFound() {
  return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

export async function onRequest({ request, env, params }) {
  const method = request.method;
  if (method !== 'GET' && method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const segments = Array.isArray(params.path) ? params.path : [params.path];
  // Refuse anything that could leave the prefix: empty, "." / "..", or a separator hidden in a segment.
  for (const s of segments) {
    if (typeof s !== 'string' || s === '' || s === '.' || s === '..' || s.includes('\\') || s.includes('/')) {
      return notFound();
    }
  }
  const key = PREFIX + segments.join('/');

  let object;
  try {
    object = method === 'HEAD' ? await env.NOVEL_IMAGES.head(key) : await env.NOVEL_IMAGES.get(key);
  } catch {
    return new Response('Unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!object) return notFound();

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || 'image/webp');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('ETag', object.httpEtag);

  if (request.headers.get('If-None-Match') === object.httpEtag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(method === 'HEAD' ? null : object.body, { headers });
}
