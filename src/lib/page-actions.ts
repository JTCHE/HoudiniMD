/** What the open page can do with itself. The page header owns these
    (`MarkdownActions`) and puts them here while it is mounted, so its
    drop-down and the right-click menu run the same items and not copies. */
import type { MenuEntry } from "@/components/ui/MenuList";

export interface PageActions {
  path: string;
  title: string;
  /** Resolves true once the Markdown is on the clipboard. */
  copy: () => Promise<boolean>;
  copyLink: MenuEntry;
  openOnSideFx: MenuEntry;
  openMarkdown: MenuEntry;
  /** The ones below are absent in Houdini's pane: no file, no dialog. */
  openSource?: MenuEntry;
  save?: MenuEntry;
  obsidian?: MenuEntry;
  askClaude: MenuEntry;
  askChatGpt: MenuEntry;
}

let current: PageActions | null = null;

export function setPageActions(actions: PageActions | null) {
  current = actions;
}

export function pageActions(): PageActions | null {
  return current;
}
