import { render } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { FindHighlights } from './FindHighlights';

describe('FindHighlights', () => {
  const text = 'Mai gặp Nam. Mai cười. Nam hỏi Mai.';
  const matches = [0, text.indexOf('Mai', 1), text.lastIndexOf('Mai')].map((start) => ({ start, end: start + 3 }));

  it('marks every match, only the current one specially, and hides itself from assistive tech', () => {
    const ref = createRef<HTMLTextAreaElement>();
    const { container } = render(<FindHighlights text={text} matches={matches} current={1} textareaRef={ref} />);

    const marks = container.querySelectorAll('mark.find-hit');
    expect(marks).toHaveLength(3);
    expect([...marks].map((m) => m.classList.contains('find-hit--current'))).toEqual([false, true, false]);
    expect([...marks].map((m) => m.textContent)).toEqual(['Mai', 'Mai', 'Mai']);
    const backdrop = container.firstElementChild as HTMLElement;
    expect(backdrop).toHaveAttribute('aria-hidden', 'true');
    expect(backdrop.textContent).toBe(text + '\n');
  });

  it('copies the textarea\'s wrapping styles onto the backdrop', () => {
    const el = document.createElement('textarea');
    el.style.fontSize = '17px';
    el.style.lineHeight = '1.7';
    el.style.paddingLeft = '12px';
    document.body.append(el);
    const { container } = render(<FindHighlights text={text} matches={matches} current={null} textareaRef={{ current: el }} />);

    const backdrop = container.firstElementChild as HTMLElement;
    expect(backdrop.style.fontSize).toBe('17px');
    expect(backdrop.style.paddingLeft).toBe('12px');
    expect(backdrop.style.color).toBe('transparent');
    el.remove();
  });
});
