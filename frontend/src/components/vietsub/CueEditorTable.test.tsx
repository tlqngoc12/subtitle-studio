import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ViCue } from '../../api/client';
import { CueEditorTable } from './CueEditorTable';

const cues: ViCue[] = Array.from({ length: 8 }, (_, i) => ({ startMs: i * 1000, endMs: i * 1000 + 900, text: `Dòng ${i + 1}` }));
const texts = cues.map((c) => c.text);

function table(compact: boolean) {
  return (
    <CueEditorTable
      cues={cues}
      english={new Map()}
      texts={texts}
      currentMs={0}
      readOnly={false}
      errors={{}}
      compact={compact}
      onChange={() => {}}
      onSeek={() => {}}
      onSeekPause={() => {}}
    />
  );
}

describe('CueEditorTable compact scrolling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  /** Box top 100, header 30 tall, the row of line 5 at 400. */
  function stubGeometry() {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('cue-table')) return { top: 100, height: 300 } as DOMRect;
      if (this.tagName === 'THEAD') return { top: 100, height: 30 } as DOMRect;
      if (this.tagName === 'TR' && this.contains(screen.getByLabelText('Line 5 text'))) return { top: 400, height: 60 } as DOMRect;
      return { top: 0, height: 0 } as DOMRect;
    });
  }

  it('scrolls the focused row to the top of the box when compact', () => {
    const { rerender, container } = render(table(false));
    const box = container.querySelector('.cue-table') as HTMLDivElement;
    box.scrollTop = 50;
    act(() => screen.getByLabelText('Line 5 text').focus());
    stubGeometry();
    rerender(table(true));
    expect(box.scrollTop).toBe(50 + 400 - 100 - 30);
  });

  it('does not move focus when it scrolls', () => {
    const { rerender } = render(table(false));
    const input = screen.getByLabelText('Line 5 text');
    act(() => input.focus());
    stubGeometry();
    rerender(table(true));
    expect(document.activeElement).toBe(input);
  });

  it('does not scroll when not compact', () => {
    const { container } = render(table(false));
    const box = container.querySelector('.cue-table') as HTMLDivElement;
    box.scrollTop = 50;
    act(() => screen.getByLabelText('Line 5 text').focus());
    expect(box.scrollTop).toBe(50);
  });
});
