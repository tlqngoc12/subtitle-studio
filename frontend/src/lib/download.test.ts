import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveBlob } from './download';

afterEach(() => vi.restoreAllMocks());

describe('saveBlob', () => {
  it('clicks a temporary download link and removes it', () => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    let clicked: HTMLAnchorElement | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked = this;
    });

    saveBlob(new Blob(['x']), 'a.zip');

    expect(clicked).not.toBeNull();
    expect(clicked!.download).toBe('a.zip');
    expect(document.body.contains(clicked)).toBe(false);
  });
});
