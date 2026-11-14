import { act, render } from '@testing-library/react';
import { StrictMode, useRef } from 'react';
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
    // jsdom has no layout: the box is as tall as it was set, so the text always fits and no retry is needed.
    vi.spyOn(HTMLTextAreaElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLTextAreaElement) {
      return Number.parseFloat(this.style.height) || 0;
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

describe('useAutoGrow in a real page', () => {
  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    // A real cancel: the callback never runs.
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      frames[id - 1] = () => {};
    });
    Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true });
    vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLTextAreaElement) {
      return this.value.length * 10;
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('still grows under StrictMode, which mounts, unmounts and mounts the effects again', () => {
    const { getByLabelText, rerender } = render(
      <StrictMode>
        <Box value={'x'.repeat(250)} />
      </StrictMode>,
    );
    flush();
    expect(getByLabelText('box').style.height).toBe('2500px');

    rerender(
      <StrictMode>
        <Box value={'x'.repeat(300)} />
      </StrictMode>,
    );
    flush();
    expect(getByLabelText('box').style.height).toBe('3000px');
  });

  it('measures a textarea that mounts after the first render, with a value that arrives later', () => {
    function Late({ value, ready }: { value: string; ready: boolean }) {
      const ref = useRef<HTMLTextAreaElement>(null);
      useAutoGrow(ref, value);
      return ready ? <textarea ref={ref} aria-label="late" value={value} readOnly /> : <p>loading</p>;
    }
    const { getByLabelText, rerender } = render(<Late value="" ready={false} />);
    rerender(<Late value={'y'.repeat(200)} ready />);
    flush();

    expect(getByLabelText('late').style.height).toBe('2000px');
  });
});

describe('useAutoGrow never clips text', () => {
  const BORDER = 2;
  let width = 400;
  let resize: (() => void) | null = null;

  beforeEach(() => {
    frames = [];
    width = 400;
    resize = null;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          resize = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true });
    // The border is 2 px: offsetHeight is the set height, clientHeight is that minus the border.
    const heightOf = (el: HTMLTextAreaElement) => (Number.parseFloat(el.style.height) || 100);
    vi.spyOn(HTMLTextAreaElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLTextAreaElement) {
      return heightOf(this);
    });
    vi.spyOn(HTMLTextAreaElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLTextAreaElement) {
      return heightOf(this) - BORDER;
    });
    vi.spyOn(HTMLTextAreaElement.prototype, 'clientWidth', 'get').mockImplementation(() => width);
    // Narrower means more lines: 10 px per character per 400 px of width.
    vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLTextAreaElement) {
      return Math.round((this.value.length * 10 * 400) / width);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, 'fonts');
  });

  const clip = (el: HTMLElement) => el.scrollHeight - el.clientHeight;

  it('adds the border to the height, so scrollHeight never exceeds clientHeight', () => {
    const { getByLabelText } = render(<Box value={'x'.repeat(250)} />);
    flush();

    const el = getByLabelText('box');
    expect(el.style.height).toBe(`${2500 + BORDER}px`);
    expect(clip(el)).toBeLessThanOrEqual(0);
  });

  it('measures again after the web fonts have loaded', async () => {
    let loaded!: () => void;
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: new Promise<void>((r) => (loaded = r)), addEventListener: () => {}, removeEventListener: () => {} },
    });
    const { getByLabelText } = render(<Box value={'x'.repeat(250)} />);
    flush();
    const el = getByLabelText('box');
    expect(el.style.height).toBe('2502px');

    // The font arrives and the same text wraps into more lines.
    width = 300;
    await act(async () => {
      loaded();
      await Promise.resolve();
    });
    flush();

    expect(el.style.height).toBe(`${Math.round((250 * 10 * 400) / 300) + BORDER}px`);
    expect(clip(el)).toBeLessThanOrEqual(0);
  });

  it('measures again when the width changes', () => {
    const { getByLabelText } = render(<Box value={'x'.repeat(250)} />);
    flush();
    const el = getByLabelText('box');

    width = 200;
    act(() => resize?.());
    flush();

    expect(el.style.height).toBe(`${5000 + BORDER}px`);
  });

  it('tries once more on the next frame when the text still does not fit', () => {
    const { getByLabelText } = render(<Box value={'x'.repeat(250)} />);
    flush();
    const el = getByLabelText('box');

    // Something re-wraps the text between the measure and the check (a late font): the guard measures again.
    let reads = 0;
    vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockImplementation(() => {
      reads += 1;
      return reads === 1 ? 2500 : 2700; // the first read, then the text turns out taller
    });
    width = 399; // any width change that the observer reports
    act(() => resize?.());
    flush();
    expect(clip(el)).toBeGreaterThan(0); // the first pass came out short...
    expect(frames).toHaveLength(1); // ...so the guard asked for another frame
    flush();

    expect(el.style.height).toBe(`${2700 + BORDER}px`);
    expect(clip(el)).toBeLessThanOrEqual(0);
    expect(frames).toHaveLength(0);
  });
});
