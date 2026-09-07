/**
 * Every glyph the app chrome draws, in one place.
 *
 * The shell never imports an icon package directly. It asks for a ROLE —
 * `Icons.bookmark`, `Icons.back` — so swapping the drawing behind a role is an
 * edit to this file and to nothing else. A role that lucide already draws well
 * is an alias; a role lucide has no honest match for (the Windows caption
 * buttons, which must be the OS shapes and not a rounded-cap approximation) is
 * drawn here.
 *
 * Sizes are NOT set here. A role is used at 10px in a tree row and at 15px in a
 * list row, so the caller states the size and this file states the shape.
 */
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookOpen,
  Bug,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Clock,
  Code2,
  FileText,
  Folder,
  Library,
  Workflow,
  PanelLeft,
  Search,
  Settings,
  X,
  Moon,
  Sun,
  type LucideIcon,
} from "lucide-react";

export type IconComponent = LucideIcon | ((props: { className?: string }) => React.ReactElement);

/**
 * The Windows 11 caption buttons.
 *
 * Drawn rather than aliased: the OS shapes are 1px strokes on a 10px box with
 * square caps, and lucide's rounded 2px caps read as a different application's
 * buttons sitting in the title bar. `shape-rendering` keeps the strokes on the
 * pixel grid at the small size they are used at.
 */
function CaptionMinimize({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 10 10" className={className} shapeRendering="crispEdges" aria-hidden="true">
      <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function CaptionMaximize({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 10 10" className={className} shapeRendering="crispEdges" aria-hidden="true">
      <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

/** Two offset squares, the shape Windows uses once a window is maximized. */
function CaptionRestore({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 10 10" className={className} shapeRendering="crispEdges" aria-hidden="true">
      <path d="M2.5 2.5V0.5h7v7h-2" fill="none" stroke="currentColor" strokeWidth="1" />
      <rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function CaptionClose({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 10 10" className={className} aria-hidden="true">
      <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

export const Icons = {
  /* App chrome */
  sidebarToggle: PanelLeft,
  back: ArrowLeft,
  forward: ArrowRight,
  settings: Settings,
  themeLight: Sun,
  themeDark: Moon,
  bugReport: Bug,
  search: Search,

  /* Window caption */
  captionMinimize: CaptionMinimize,
  captionMaximize: CaptionMaximize,
  captionRestore: CaptionRestore,
  captionClose: CaptionClose,

  /* Disclosure */
  expanded: ChevronDown,
  collapsed: ChevronRight,
  versionPicker: ChevronsUpDown,

  /* Content */
  bookmark: Bookmark,
  dismiss: X,
  recent: Clock,
  /** A page the help holds no icon for. */
  page: FileText,
  /** A section the help holds no icon for. A section holds pages, so the page
      glyph is the wrong shape: it says the row IS a page. */
  section: Folder,

  /* The four groups the sidebar tree opens with. Keyed by the group id in
     `lib/landing/tree.ts`, so a new group there asks for a mark here. */
  groupNodes: Workflow,
  groupLanguages: Code2,
  groupLearn: BookOpen,
  groupReference: Library,
} satisfies Record<string, IconComponent>;

export type IconRole = keyof typeof Icons;

/** The mark for a top-level tree group, by its id. */
export function groupIcon(id: string): IconComponent | null {
  const role = `group${id.charAt(0).toUpperCase()}${id.slice(1)}` as IconRole;
  return role in Icons ? Icons[role] : null;
}
