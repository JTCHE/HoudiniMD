import { useEffect, useState } from "react";
import { invoke } from "@/lib/backend";
import { showToast } from "@/components/ui/toast-notification";

/**
 * The local server the Houdini help pane talks to, named the way a developer
 * names one: a dot for alive, the address beside it.
 *
 * It sits in the status bar, at the far right of the window's own chrome,
 * because it is a fact about the app and not about the page being read.
 *
 * `server_port` answers 0 when the server never started. That draws nothing —
 * a dead address in the corner is worse than an empty corner.
 *
 * The dot pings. It is the one control on the screen that says the server is
 * alive, so the motion carries meaning. It stays inside the rules in
 * AGENTS.md: transform and opacity only, no blur and no filter behind it, and
 * the body pauses it when the window loses the focus.
 */
export function ServerPortBadge() {
  const [port, setPort] = useState(0);

  useEffect(() => {
    let live = true;
    void invoke<number>("server_port")
      .catch(() => 0)
      .then((value) => {
        if (live) setPort(value);
      });
    return () => {
      live = false;
    };
  }, []);

  if (!port) return null;

  const address = `http://localhost:${port}`;

  // A press copies. The address is the thing a reader wants in a Houdini
  // preference field or in a phone's browser, and that is a paste, not a
  // visit. Ctrl or ⌘ opens it, the way a link behaves everywhere else.
  function open(event: React.MouseEvent) {
    if (event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    void navigator.clipboard
      .writeText(address)
      .then(() => showToast("Copied the server address", "info"))
      .catch(() => showToast("Could not copy the server address", "error"));
  }

  return (
    <a
      href={address}
      target="_blank"
      rel="noopener noreferrer"
      onClick={open}
      title="Press to copy. Ctrl-press to open it in the browser."
      className="flex shrink-0 cursor-interactive items-center gap-sm text-meta text-neutral-500 transition-colors duration-(--duration-fast) motion-reduce:transition-none pointer-hover:text-neutral-800 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {address.slice("http://".length)}
      <span
        className="relative grid size-1.5 shrink-0 place-items-center"
        aria-hidden="true"
      >
        <span className="server-ping absolute size-1.5 rounded-full bg-brand" />
        <span className="absolute size-1.5 rounded-full bg-brand" />
      </span>
    </a>
  );
}
