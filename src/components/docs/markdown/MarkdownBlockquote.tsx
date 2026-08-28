import type { Components } from "react-markdown";

/** Callouts are tagged with data-callout by the remark-callouts plugin; the
 *  surface itself is styled by the .callout rules in globals.css. */
export const Blockquote: Components["blockquote"] = ({ children, className, ...props }) => {
  const calloutType = (props as Record<string, string>)["data-callout"];
  if (calloutType) {
    const label =
      (props as Record<string, string>)["data-callout-title"] ??
      calloutType.charAt(0).toUpperCase() + calloutType.slice(1);
    return (
      <blockquote
        className={`not-prose ${className ?? ""}`}
        data-callout={calloutType}
      >
        <p className="callout-title">{label}</p>
        {children}
      </blockquote>
    );
  }
  return (
    <blockquote className="not-prose border-l-2 border-foreground/30 pl-4 my-4 text-muted-foreground text-sm italic">
      {children}
    </blockquote>
  );
};
