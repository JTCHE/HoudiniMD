import { inTauri } from "./backend";

/** Opens a web address in the reader's browser: the desktop window hands it to
    the system, Houdini's pane opens a window of its own. */
export async function openWeb(url: string) {
  if (!inTauri) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}
