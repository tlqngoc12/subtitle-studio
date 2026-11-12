import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SiteProvider } from '../data/SiteContext';
import { fakeSource } from '../test/fakeSource';
import { SkipLink } from './SkipLink';

describe('SkipLink', () => {
  it('moves focus to the page main and is the first tab stop', async () => {
    render(
      <>
        <SkipLink />
        <button type="button">Other</button>
        <main>content</main>
      </>,
    );
    await userEvent.tab();
    const link = screen.getByRole('link', { name: 'Skip to main content' });
    expect(link).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('main')).toHaveFocus();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });

  it('is Vietnamese on the public site', () => {
    render(
      <SiteProvider value={{ source: fakeSource({}), readOnly: true, homePath: '/' }}>
        <SkipLink />
      </SiteProvider>,
    );
    expect(screen.getByRole('link', { name: 'Bỏ qua tới nội dung chính' })).toBeInTheDocument();
  });
});
