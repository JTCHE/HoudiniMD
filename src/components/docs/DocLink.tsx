import { Link } from "react-router";
import { cn } from "@/lib/utils";

export const DOC_LINK_CLASS_NAME = "underline underline-offset-2";

/**
 * Every link in the reading view. An app path opens in the window; an external
 * address opens in the reader's browser.
 */
export default function DocLink({
  href,
  children,
  className,
  underline = true,
  fullWidth = false,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  underline?: boolean;
  fullWidth?: boolean;
}) {
  const classes = cn(underline && DOC_LINK_CLASS_NAME, fullWidth && "w-full", className);
  if (/^[a-z]+:/i.test(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
        {children}
      </a>
    );
  }
  return (
    <Link to={href} className={classes}>
      {children}
    </Link>
  );
}
