import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadges } from './StatusBadges';

describe('StatusBadges', () => {
  it('puts an icon in the Published and Translating badges so the state does not rely on colour', () => {
    render(<StatusBadges translation="TRANSLATING" publish="PUBLISHED" />);
    expect(screen.getByText('Published').querySelector('svg')).not.toBeNull();
    expect(screen.getByText('Translating…').querySelector('svg')).not.toBeNull();
  });

  it('keeps the other statuses text-only', () => {
    render(<StatusBadges translation="TRANSLATED" publish="DRAFT" />);
    expect(screen.getByText('Translated').querySelector('svg')).toBeNull();
    expect(screen.getByText('Draft').querySelector('svg')).toBeNull();
  });

  it('shows a Fallback model badge only when a fallback model translated the chapter', () => {
    const { rerender } = render(
      <StatusBadges translation="TRANSLATED" publish="DRAFT" model="gemini-3.5-flash-lite" fallback />,
    );
    expect(screen.getByText('Fallback model')).toBeTruthy();
    rerender(<StatusBadges translation="TRANSLATED" publish="DRAFT" model="gemini-3.6-flash" fallback={false} />);
    expect(screen.queryByText('Fallback model')).toBeNull();
  });

  describe('compact', () => {
    it('shows icons only, each with an accessible name', () => {
      render(<StatusBadges compact translation="TRANSLATED" publish="PUBLISHED" model="gemini-x" />);

      expect(screen.queryByText('Translated')).toBeNull();
      expect(screen.queryByText('Published')).toBeNull();
      expect(screen.getByLabelText('Translated by gemini-x').querySelector('svg')).not.toBeNull();
      expect(screen.getByLabelText('Published').querySelector('svg')).not.toBeNull();
    });

    it('gives every state its own icon, so the state does not rely on colour', () => {
      const shapes = (translation: 'NONE' | 'TRANSLATING' | 'TRANSLATED' | 'FAILED', publish: 'DRAFT' | 'PUBLISHED') => {
        const { container, unmount } = render(<StatusBadges compact translation={translation} publish={publish} />);
        const out = [...container.querySelectorAll('svg')].map((s) => s.getAttribute('class'));
        unmount();
        return out.join('|');
      };
      const all = [
        shapes('NONE', 'DRAFT'),
        shapes('TRANSLATING', 'DRAFT'),
        shapes('TRANSLATED', 'DRAFT'),
        shapes('FAILED', 'DRAFT'),
        shapes('NONE', 'PUBLISHED'),
      ];
      expect(new Set(all).size).toBe(all.length);
    });

    it('marks a fallback translation with a re-translate hint', () => {
      render(<StatusBadges compact translation="TRANSLATED" publish="DRAFT" model="lite" fallback />);

      expect(screen.getByLabelText(/re-translate/)).toBeInTheDocument();
    });

    it('shows only the publish state for an original story', () => {
      render(<StatusBadges compact publish="DRAFT" />);

      expect(screen.getAllByRole('img')).toHaveLength(1);
      expect(screen.getByLabelText('Draft')).toBeInTheDocument();
    });
  });
});
