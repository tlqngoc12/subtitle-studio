import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SiteProvider } from '../data/SiteContext';
import { fakeSource } from '../test/fakeSource';
import { useT } from './i18n';

function Probe() {
  const t = useT();
  return <p>{t('Hello', 'Xin chào')}</p>;
}

describe('useT', () => {
  it('is English in the admin app and Vietnamese on the public site', () => {
    const { unmount } = render(<Probe />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
    unmount();
    render(
      <SiteProvider value={{ source: fakeSource({}), readOnly: true, homePath: '/' }}>
        <Probe />
      </SiteProvider>,
    );
    expect(screen.getByText('Xin chào')).toBeInTheDocument();
  });
});
