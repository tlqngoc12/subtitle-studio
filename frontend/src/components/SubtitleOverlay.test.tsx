import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SubtitleOverlay } from './SubtitleOverlay';

describe('SubtitleOverlay', () => {
  it('shows the cue text keeping line breaks', () => {
    render(<SubtitleOverlay cue={{ startMs: 0, endMs: 1_000, text: 'dòng 1\ndòng 2' }} />);

    const line = screen.getByText(/dòng 1/);
    expect(line.textContent).toBe('dòng 1\ndòng 2');
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
