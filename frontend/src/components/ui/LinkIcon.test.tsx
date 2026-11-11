import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { iconFor, LinkIcon } from './LinkIcon';

describe('iconFor', () => {
  it.each([
    ['https://youtu.be/x', null, 'youtube'],
    ['https://www.youtube.com/watch?v=x', null, 'youtube'],
    ['https://www.netflix.com/title/1', null, 'netflix'],
    ['https://music.apple.com/us/album/x', null, 'applemusic'],
    ['https://line.me/R/ti/p/x', null, 'line'],
    ['https://www.iq.com/play/x', null, 'link'],
    ['https://wetv.vip/x', null, 'link'],
    ['not a url', null, 'link'],
    ['https://www.iq.com/play/x', 'netflix', 'netflix'],
    ['https://youtu.be/x', 'link', 'link'],
    ['https://youtu.be/x', 'nonsense', 'youtube'],
  ])('%s with key %s is %s', (url, key, expected) => {
    expect(iconFor(url, key)).toBe(expected);
  });
});

describe('LinkIcon', () => {
  it('draws a brand logo or the generic icon, always decorative', () => {
    const brand = render(<LinkIcon iconKey="instagram" />);
    const svg = brand.container.querySelector('svg');
    expect(svg).toHaveAttribute('data-platform', 'instagram');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    brand.unmount();

    const generic = render(<LinkIcon iconKey="link" />);
    expect(generic.container.querySelector('svg')).not.toHaveAttribute('data-platform');
  });
});
