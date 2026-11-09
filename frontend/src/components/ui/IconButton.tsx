import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, Ref } from 'react';
import { Link, type LinkProps } from 'react-router';
import { Tip } from '../Tip';

function classes(extra?: string) {
  return extra ? `button button--icon ${extra}` : 'button button--icon';
}

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  /** Used for both the tooltip and the accessible name, so they cannot differ. */
  label: string;
  icon: LucideIcon;
  ref?: Ref<HTMLButtonElement>;
};

/** An icon-only button with a tooltip. */
export function IconButton({ label, icon: Icon, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <Tip label={label}>
      <button type={type} className={classes(className)} aria-label={label} {...rest}>
        <Icon className="icon" aria-hidden="true" />
      </button>
    </Tip>
  );
}

type IconLinkProps = Omit<LinkProps, 'aria-label'> & { label: string; icon: LucideIcon };

/** An icon-only router link with a tooltip. */
export function IconLink({ label, icon: Icon, className, ...rest }: IconLinkProps) {
  return (
    <Tip label={label}>
      <Link className={classes(className)} aria-label={label} {...rest}>
        <Icon className="icon" aria-hidden="true" />
      </Link>
    </Tip>
  );
}
