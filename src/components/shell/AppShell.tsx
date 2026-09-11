/**
 * The window: a title bar, a panel, and whatever is being read.
 *
 * Both routes render inside this, so the panel and the bar do not remount when
 * the reader opens a page — the tree keeps the branches they opened, and the
 * window keeps its scroll.
 *
 * The shell owns the window's height and never scrolls. Only the content
 * column does, which is what keeps the bar at the top and the keys at the
 * bottom no matter how long a page is.
 */
import { useState } from "react";
import { useLocation } from "react-router";
import { cn } from "@/lib/utils";
import { invoke, inTauri } from "@/lib/backend";
import { isCommand, isTyping, useHotkey } from "@/lib/hotkeys";
import { Onboarding, useOnboarding } from "@/components/onboarding/Onboarding";
import { TitleBar } from "./TitleBar";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  // Closed by default inside Houdini's help pane: that window is small, and
  // giving the page its full width back matters more there than in the
  // desktop window, which has room to spare. The reader can still open it.
  const [sidebarOpen, setSidebarOpen] = useState(inTauri);
  // The setup owns the window until it is done. It is read from the settings,
  // so the window draws neither the app nor the setup for that first moment
  // rather than flashing the one it turns out not to need.
  const { show: onboarding, finish } = useOnboarding();

  // ⌘B shows and hides the panel, the shortcut every editor with a panel
  // uses for it.
  useHotkey((event) => {
    if (event.key !== "b" || !isCommand(event) || event.shiftKey) return;
    if (isTyping(event.target)) return;
    event.preventDefault();
    setSidebarOpen((open) => !open);
  });

  // ⌘N opens one more window, as in a browser. Only the desktop app makes
  // windows: in Houdini's pane the key stays Qt's.
  useHotkey((event) => {
    if (!inTauri || event.key.toLowerCase() !== "n" || !isCommand(event) || event.shiftKey) return;
    event.preventDefault();
    void invoke("new_window").catch(() => {});
  });

  // ⌘W closes this window, as in a browser. The first window hides to the
  // tray, the same as its close button.
  useHotkey((event) => {
    if (!inTauri || event.key.toLowerCase() !== "w" || !isCommand(event) || event.shiftKey) return;
    event.preventDefault();
    void invoke("close_window").catch(() => {});
  });

  const path = location.pathname.replace(/^\/+/, "");
  const onLanding = path === "";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <TitleBar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
        showTrail={!onLanding}
        bare={onboarding === true}
      />

      {onboarding === null && <div className="flex-1" />}
      {onboarding === true && <Onboarding onDone={finish} />}
      {onboarding === false && (
      <div className="flex min-h-0 flex-1">
        {sidebarOpen && <Sidebar currentPath={path || undefined} />}

        <div className={cn("relative flex min-w-0 flex-1 flex-col overflow-hidden")}>
          {children}
          {/* The strip lies over the bottom of the page, which runs on under
              it and fades out (see .status-scrim), so the page needs room for
              it at its own foot. Only its contents take the pointer: the
              scrollbar under it still drags. */}
          <StatusBar className="pointer-events-none absolute inset-x-0 bottom-0 z-10 [&>*]:pointer-events-auto" />
        </div>
      </div>
      )}
    </div>
  );
}
