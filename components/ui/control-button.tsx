import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The raised key. One look, wherever a page needs its primary control: the
 * search field's own key, the download button in the wind-down notice.
 *
 * It renders an anchor when given `href` and a button otherwise, so a link
 * that must look like a key does not have to fake one.
 */
export function ControlButton({
  children,
  icon,
  href,
  type = "button",
  disabled,
  onClick,
  className,
  ...rest
}: {
  children: ReactNode;
  /** Sits before the label, at the label's own size. */
  icon?: ReactNode;
  /** Given, the key is a link. */
  href?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
} & Pick<React.AnchorHTMLAttributes<HTMLAnchorElement>, "target" | "rel">) {
  const look = cn(
    "relative inline-flex shrink-0 cursor-pointer items-center gap-sm select-none rounded-lg border border-control-edge",
    "bg-linear-to-b from-control-top to-control-bottom",
    // No padding here. `md` is a custom spacing key, so tailwind-merge does
    // not know `p-md` conflicts with `px-md`, and a caller that wants its own
    // inset cannot override one set here. Every caller states its own.
    "text-label text-sm font-semibold whitespace-nowrap text-control-foreground",
    // The sheen along the top edge is what makes the key read as raised.
    // The press drops it and sinks the key by the same 1px, so the two
    // states differ the way a real key does.
    "shadow-control inset-shadow-[0_1px_0_0_var(--control-sheen)]",
    "transition duration-(--duration-fast) active:translate-y-px active:inset-shadow-none",
    "disabled:cursor-wait motion-reduce:transition-none",
    className,
  );

  if (href)
    return (
      <a href={href} className={look} {...rest}>
        {icon}
        {children}
      </a>
    );

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={look}>
      {icon}
      {children}
    </button>
  );
}
