import { act, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoGrow } from './useAutoGrow';

function Box({ value }: { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useAutoGrow(ref, value);
  return <textarea ref={ref} aria-label="box" value={value} readOnly />;
}

let frames: FrameRequestCallback[] = [];
const flush = () =>
  act(() => {
    const run = frames;
    frames = [];
    run.forEach((cb) => cb(0));
  });

describe('useAutoGrow', () => {
  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true });
    // 10 px per character, so the text height is easy to control.
    vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLTextAreaElement) {
      return this.value.length * 10;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is at least 60 % of the window high for short text', () => {
    const { getByLabelText } = render(<Box value="short" />);
    flush();

    expect(getByLabelText('box').style.height).toBe('600px');
  });

  it('grows to the scroll height of long text, so the textarea never scrolls itself', () => {
    const { getByLabelText, rerender } = render(<Box value="short" />);
    flush();

    rerender(<Box value={'x'.repeat(250)} />);
    flush();

    expect(getByLabelText('box').style.height).toBe('2500px');
  });

  it('shrinks again when the text gets shorter', () => {
    const { getByLabelText, rerender } = render(<Box value={'x'.repeat(250)} />);
    flush();
    rerender(<Box value="x" />);
    flush();

    expect(getByLabelText('box').style.height).toBe('600px');
  });

  it('measures at most once per animation frame however many changes come', () => {
    const { rerender } = render(<Box value="a" />);
    flush();
    const before = frames.length;

    for (let i = 0; i < 20; i++) rerender(<Box value={'a'.repeat(i + 2)} />);

    expect(before).toBe(0);
    expect(frames).toHaveLength(1);
    flush();
    expect(frames).toHaveLength(0);
  });
});
