/**
 * The name of a button that shows only an icon, in the app's tooltip.
 *
 * A native `title` waits a second and draws the system's box, which reads as
 * another program. This one uses the box every link in the page uses, after
 * a short wait so a pointer crossing the bar does not flash a row of names.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { TooltipBox } from "@/components/docs/Tooltip";

const WAIT = 400;

export function Hint({ label, keys, children }: { label: string; keys?: string; children: ReactNode }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(false);
  const timer = useRef<number>(undefined);

  const hide = () => {
    window.clearTimeout(timer.current);
    setShown(false);
  };
  useEffect(() => hide, []);

  return (
    <span
      ref={anchor}
      className="inline-flex shrink-0"
      onPointerEnter={() => {
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setShown(true), WAIT);
      }}
      onPointerLeave={hide}
      // A press is the answer to the question the name was for.
      onPointerDown={hide}
    >
      {children}
      {shown && (
        <TooltipBox anchorRef={anchor} className="w-max max-w-[16rem]">
          <span className="flex items-center gap-2 font-medium text-foreground">
            {label}
            {keys && <span className="font-normal text-muted-foreground">{keys}</span>}
          </span>
        </TooltipBox>
      )}
    </span>
  );
}
