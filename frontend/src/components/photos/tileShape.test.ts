import { describe, expect, it } from 'vitest';
import { tileShape } from './tileShape';

describe('tileShape', () => {
  it.each([
    [1080, 1350, 'tall'],
    [1080, 1080, 'square'],
    [1000, 1190, 'square'],
    [1000, 1200, 'tall'],
    [1000, 800, 'wide'],
    [1000, 801, 'square'],
    [1600, 900, 'wide'],
  ])('%i x %i is %s', (w, h, shape) => {
    expect(tileShape(w, h)).toBe(shape);
  });
});
