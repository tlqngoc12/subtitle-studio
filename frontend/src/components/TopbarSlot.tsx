import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface TopbarSlot {
  /** The element inside the top bar that a page may fill; null until the NavBar has mounted (or without a NavBar). */
  target: HTMLElement | null;
  setTarget: (el: HTMLElement | null) => void;
  /** True while a page fills the slot: the NavBar then shows the slot instead of the logo and the main menu. */
  active: boolean;
  setActive: (active: boolean) => void;
  /** True while the page asks for the whole top bar to slide away (scrolling down). */
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
}

const noop = () => {};
const Context = createContext<TopbarSlot>({
  target: null,
  setTarget: noop,
  active: false,
  setActive: noop,
  hidden: false,
  setHidden: noop,
});

/**
 * Lets a page put its own controls into the site top bar (the chapter reader does). The page keeps owning its state:
 * it portals its controls into `target`, so they stay in the page's React tree.
 */
export function TopbarSlotProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState(false);
  const [hidden, setHidden] = useState(false);
  const value = useMemo(() => ({ target, setTarget, active, setActive, hidden, setHidden }), [target, active, hidden]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useTopbarSlot(): TopbarSlot {
  return useContext(Context);
}
