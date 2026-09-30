"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { THEME_KEY } from "@/lib/theme";

type Theme = "light" | "dark";

const read = () => (document.documentElement.dataset.theme as Theme) ?? "light";

/** The root attribute changes from here, from the app in the frame (through
    the `storage` event) and from the system: watch the attribute itself. */
function subscribe(notify: () => void) {
  const watch = new MutationObserver(notify);
  watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => watch.disconnect();
}

/** The app's own theme switch (the sidebar footer's), for the page. The app in
    the frame follows it through the shared key. */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, read, () => "light" as Theme);
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      aria-label={`Switch to the ${next} theme`}
      title={theme === "dark" ? "Light theme" : "Dark theme"}
      onClick={() => {
        try {
          localStorage.setItem(THEME_KEY, next);
        } catch {
          // A blocked store keeps the switch for this page only.
        }
        document.documentElement.dataset.theme = next;
      }}
      className={
        "grid size-[34px] cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors " +
        "hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none " +
        (className ?? "")
      }
    >
      {/* Not one size, as in the app: a crescent fills less of its box than a
          sun with its rays. */}
      {theme === "dark" ? (
        <Sun className="size-[17px] transition-transform duration-500 hover:rotate-45" strokeWidth={1.25} absoluteStrokeWidth />
      ) : (
        <Moon className="size-4 transition-transform duration-500 hover:-rotate-12" strokeWidth={1.25} absoluteStrokeWidth />
      )}
    </button>
  );
}
