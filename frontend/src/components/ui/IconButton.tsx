import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, Ref } from 'react';
import { Link, type LinkProps } from 'react-router';
import { Tip } from '../Tip';

function classes(extra?: string, small?: boolean) {
  const base = small ? 'button button--icon button--s' : 'button button--icon';
  return extra ? `${base} ${extra}` : base;
}

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  /** Used for both the tooltip and the accessible name, so they cannot differ. */
  label: string;
  icon: LucideIcon;
  /** `s` is the 32 px button used inside rows and toolbars. */
  size?: 's';
  ref?: Ref<HTMLButtonElement>;
};

/** An icon-only button with a tooltip. */
export function IconButton({ label, icon: Icon, className, size, type = 'button', ...rest }: IconButtonProps) {
  return (
    <Tip label={label}>
      <button type={type} className={classes(className, size === 's')} aria-label={label} {...rest}>
        <Icon className="icon" aria-hidden="true" />
      </button>
    </Tip>
  );
}

type IconLinkProps = Omit<LinkProps, 'aria-label'> & { label: string; icon: LucideIcon; size?: 's' };

/** An icon-only router link with a tooltip. */
export function IconLink({ label, icon: Icon, className, size, ...rest }: IconLinkProps) {
  return (
    <Tip label={label}>
      <Link className={classes(className, size === 's')} aria-label={label} {...rest}>
        <Icon className="icon" aria-hidden="true" />
      </Link>
    </Tip>
  );
}
