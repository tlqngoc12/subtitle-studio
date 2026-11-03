import * as Tooltip from '@radix-ui/react-tooltip';
import type { ReactElement } from 'react';

/**
 * Styled tooltip for icon-only controls (replaces the browser's slow `title`). Opens on hover and on keyboard
 * focus, closes on Esc. The control keeps its own `aria-label`; the tooltip only repeats it visually.
 * Each tip has its own provider so components also work outside <App> (tests, isolated renders).
 */
export function Tip({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip.Provider delayDuration={300} skipDelayDuration={150}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="tip" side="top" sideOffset={6} collisionPadding={8}>
            {label}
            <Tooltip.Arrow className="tip__arrow" width={10} height={5} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
