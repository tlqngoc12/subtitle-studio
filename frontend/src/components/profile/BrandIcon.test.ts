import { describe, expect, it } from 'vitest';
import { platformIcon } from './BrandIcon';

describe('platformIcon', () => {
  it.each([
    ['https://www.instagram.com/emiamily', 'instagram'],
    ['https://instagram.com/x', 'instagram'],
    ['https://x.com/emi', 'x'],
    ['https://twitter.com/emi', 'x'],
    ['https://www.tiktok.com/@emi', 'tiktok'],
    ['https://m.facebook.com/emi', 'facebook'],
    ['https://youtu.be/dQw4w9WgXcQ', 'youtube'],
    ['https://open.spotify.com/artist/4uLU6hMCjMI75M1A2tKUQC', 'spotify'],
    ['https://www.threads.net/@emi', 'threads'],
  ])('recognises %s', (url, slug) => {
    expect(platformIcon(url)?.slug).toBe(slug);
  });

  it.each([['https://www.gmm-tv.com/emi'], ['https://notinstagram.com/x'], ['not a url'], [null]])(
    'falls back for %s',
    (url) => {
      expect(platformIcon(url)).toBeNull();
    },
  );
});
