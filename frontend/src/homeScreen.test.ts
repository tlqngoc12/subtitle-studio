import { describe, expect, it } from 'vitest';
import indexHtml from '../index.html?raw';
import publicHtml from '../public.html?raw';
import adminManifest from '../public/manifest.webmanifest?raw';
import publicManifest from '../public/public.webmanifest?raw';

// Paths of the files in public/ (served at the site root), e.g. "/icon-192.png".
const published = Object.keys(import.meta.glob('../public/*.png')).map((p) => p.replace('../public', ''));

describe('home-screen icons', () => {
  it.each([
    [indexHtml, '/manifest.webmanifest', 'Studio'],
    [publicHtml, '/public.webmanifest', 'byZenQN'],
  ])('a page links a PNG touch icon, its manifest and the app title (%#)', (html, manifest, title) => {
    expect(html).toContain('rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"');
    expect(html).toContain(`rel="manifest" href="${manifest}"`);
    expect(html).toContain(`name="apple-mobile-web-app-title" content="${title}"`);
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(html).toContain('name="mobile-web-app-capable" content="yes"');
    expect(html).toContain('rel="icon" type="image/webp" href="/logo.webp"');
  });

  it('ships the touch icon', () => {
    expect(published).toContain('/apple-touch-icon.png');
  });

  it.each([adminManifest, publicManifest])('a manifest points at icons that exist (%#)', (raw) => {
    const manifest = JSON.parse(raw);
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.map((i: { purpose: string }) => i.purpose)).toEqual(['any', 'any', 'maskable']);
    for (const icon of manifest.icons) {
      expect(published).toContain(icon.src);
    }
  });
});
