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
import { isCommand, isTyping, useHotkey } from "@/lib/hotkeys";
import { TitleBar } from "./TitleBar";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // ⌘B shows and hides the panel, the shortcut every editor with a panel
  // uses for it.
  useHotkey((event) => {
    if (event.key !== "b" || !isCommand(event) || event.shiftKey) return;
    if (isTyping(event.target)) return;
    event.preventDefault();
    setSidebarOpen((open) => !open);
  });

  const path = location.pathname.replace(/^\/+/, "");
  const onLanding = path === "";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <TitleBar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
        showTrail={!onLanding}
      />

      <div className="flex min-h-0 flex-1">
        {sidebarOpen && <Sidebar currentPath={path || undefined} />}

        <div className={cn("relative flex min-w-0 flex-1 flex-col overflow-hidden")}>
          {children}
          <StatusBar />
        </div>
      </div>
    </div>
  );
}
