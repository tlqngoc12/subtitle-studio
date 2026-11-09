import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const toasterProps = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));

vi.mock('sonner', () => ({
  Toaster: (props: Record<string, unknown>) => {
    toasterProps.current = props;
    return null;
  },
}));

import { AppToaster } from './AppToaster';

describe('AppToaster', () => {
  it('puts toasts in the centre of the screen on desktop and mobile', () => {
    render(<AppToaster />);
    const p = toasterProps.current!;

    expect(p.position).toBe('top-center');
    expect(p.offset).toEqual({ top: 'calc(50vh - 40px)' });
    expect(p.mobileOffset).toEqual({ top: 'calc(50vh - 40px)' });
  });

  it('keeps the close button and the 4 s duration', () => {
    render(<AppToaster />);

    expect(toasterProps.current).toMatchObject({ closeButton: true, duration: 4000 });
  });
});
