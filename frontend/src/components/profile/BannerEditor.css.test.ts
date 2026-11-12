import { describe, expect, it } from 'vitest';
import { css } from '../../test/css';

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\]/g, '\$&');
  return new RegExp(`(?:^|\n|\})\s*${escaped}\s*\{([^}]*)\}`).exec(css)?.[1] ?? '';
}

describe('banner editor CSS', () => {
  // A text input keeps its intrinsic width in a grid cell, so it must be told to fit the thumbnail card.
  it('keeps the description input inside its thumbnail card', () => {
    expect(rule('.banner-thumb .field')).toMatch(/min-width:\s*0/);
    const input = rule(".banner-thumb .field input[type='text']");
    expect(input).toMatch(/width:\s*100%/);
    expect(input).toMatch(/min-width:\s*0/);
    expect(input).toMatch(/box-sizing:\s*border-box/);
  });
});
