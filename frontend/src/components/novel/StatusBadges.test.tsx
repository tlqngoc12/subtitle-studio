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
});
