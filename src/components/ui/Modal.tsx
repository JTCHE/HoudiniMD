/**
 * A panel over the window, with the page dimmed behind it: Settings, and the
 * questions an action has to ask first. Escape or a press on the dim closes it.
 */
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Icons } from "@/lib/ui/icons";

export function Modal({
  label,
  onClose,
  className,
  children,
}: {
  label: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-center p-md" onMouseDown={onClose}>
      {/* A plain dim, not a blur: see SearchOverlay. */}
      <div className="absolute inset-0 bg-black/50" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onMouseDown={(event) => event.stopPropagation()}
        className={cn(
          "pop-in relative flex max-h-full flex-col overflow-hidden rounded-xl border border-hairline bg-background shadow-2xl",
          className,
        )}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className={cn(
            "absolute top-sm right-sm z-10 grid size-[28px] cursor-interactive place-items-center rounded-md text-neutral-500",
            "pointer-hover:bg-neutral-100 pointer-hover:text-neutral-800",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          )}
        >
          <Icons.dismiss className="size-4" />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}
