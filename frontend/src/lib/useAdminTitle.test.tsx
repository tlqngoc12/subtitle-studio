import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SiteProvider } from '../data/SiteContext';
import { fakeSource, publicSite } from '../test/fakeSource';
import { useAdminTitle } from './useAdminTitle';

function Page({ title, dirty }: { title: string | null; dirty?: boolean }) {
  useAdminTitle(title, dirty);
  return null;
}

describe('useAdminTitle', () => {
  it('sets "<page> · Subtitle Studio", marks unsaved changes with a dot and restores the old title', () => {
    document.title = 'before';
    const { rerender, unmount } = render(<Page title="Videos" />);
    expect(document.title).toBe('Videos · Subtitle Studio');

    rerender(<Page title="Videos" dirty />);
    expect(document.title).toBe('● Videos · Subtitle Studio');

    rerender(<Page title="Videos" dirty={false} />);
    expect(document.title).toBe('Videos · Subtitle Studio');

    unmount();
    expect(document.title).toBe('before');
  });

  it('leaves the title alone while there is no title yet', () => {
    document.title = 'before';
    render(<Page title={null} />);
    expect(document.title).toBe('before');
  });

  it('does nothing on the public site', () => {
    document.title = 'before';
    render(
      <SiteProvider value={publicSite(fakeSource({}))}>
        <Page title="Videos" />
      </SiteProvider>,
    );
    expect(document.title).toBe('before');
  });
});
