import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SubtitleOverlay } from './SubtitleOverlay';

describe('SubtitleOverlay', () => {
  it('shows the cue text keeping line breaks', () => {
    render(<SubtitleOverlay cue={{ startMs: 0, endMs: 1_000, text: 'dòng 1\ndòng 2' }} />);

    const line = screen.getByText(/dòng 1/);
    expect(line.textContent).toBe('dòng 1\ndòng 2');
  });

  it('scales the text by the caption size (S 1, M 1.25, L 1.5)', () => {
    const cue = { startMs: 0, endMs: 1_000, text: 'xin chào' };
    const { rerender } = render(<SubtitleOverlay cue={cue} size="s" />);
    const scale = () => screen.getByText('xin chào').parentElement!.style.getPropertyValue('--caption-scale');
    expect(scale()).toBe('1');
    rerender(<SubtitleOverlay cue={cue} size="m" />);
    expect(scale()).toBe('1.25');
    rerender(<SubtitleOverlay cue={cue} size="l" />);
    expect(scale()).toBe('1.5');
  });

  it('shows nothing without a cue', () => {
    const { container } = render(<SubtitleOverlay cue={null} />);

    expect(container.textContent).toBe('');
  });

  it('rendersMarkupAsPlainText', () => {
    const text = '<i>xin</i><script>x</script>';
    const { container } = render(<SubtitleOverlay cue={{ startMs: 0, endMs: 1_000, text }} />);

    expect(screen.getByText(text)).toBeInTheDocument();
    expect(container.querySelector('i, script')).toBeNull();
  });
});
