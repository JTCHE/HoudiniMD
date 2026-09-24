/** What the open page can do with itself, for the right-click menu. The page
    header owns the copy and the save (`MarkdownActions`); it puts them here
    while it is mounted, so the menu runs the same code and not a copy of it. */
export interface PageActions {
  path: string;
  title: string;
  /** Resolves true once the Markdown is on the clipboard. */
  copy: () => Promise<boolean>;
  /** Absent where there is no save dialog: Houdini's pane. */
  save?: () => Promise<void>;
}

let current: PageActions | null = null;

export function setPageActions(actions: PageActions | null) {
  current = actions;
}

export function pageActions(): PageActions | null {
  return current;
}
