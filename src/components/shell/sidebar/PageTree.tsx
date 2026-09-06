/**
 * The documentation, as one list.
 *
 * Everything opens IN PLACE. A group opens onto its branches, a branch opens
 * onto its contents, a family opens onto its pages, and none of it replaces
 * what is above it — the reader never loses the path they came in by, and one
 * scrollbar covers the whole tree. An earlier version swapped the panel's
 * contents for the branch you picked and gave you a back arrow to undo it;
 * that turned every look sideways into two clicks and a lost position.
 *
 * One at a time at every level. Two groups open at once, or two branches, puts
 * two lists of near-identical node names on screen and the indent is the only
 * thing telling them apart.
 *
 * Inside a branch the pages are gathered into families by their first word —
 * see `familiesOf`. The website groups them under a taxonomy the local help
 * does not carry: `#tags` are missing from 429 of the 1,203 SOP pages and
 * spell the same idea three ways, so the names are the only honest source.
 *
 * The list is windowed. A branch of twelve hundred rows costs a second of
 * layout on the click that opens it, and pays that cost again on every scroll,
 * if all of it is in the DOM. Windowing is also why the two headers that must
 * stay on screen — the open group and the open branch — are drawn OVER the
 * list rather than stuck to it: a windowed row rides on a transform, and a
 * transform is what `position: sticky` measures against, so a sticky row
 * inside the window sticks to the wrong box.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { groupIcon } from "@/lib/ui/icons";
import { VirtualList } from "@/components/ui/VirtualList";
import { familiesOf, type TreeBranch } from "@/lib/landing/tree";
import type { Hit } from "@/lib/search";
import { SidebarRow } from "./SidebarRow";

/** Every row in the panel is this tall. `--spacing-row` states it in CSS; the
    windowing needs the same number in JavaScript. */
const ROW = 30;

interface PageTreeProps {
  groups: TreeBranch[];
  /** The page on screen, so the panel can mark it. */
  currentPath?: string;
  /** The pages the reader keeps, marked in the list they are read from. */
  bookmarked?: Set<string>;
  className?: string;
}

/** One drawn line of the tree, at whatever depth it sits. */
type Line =
  | { kind: "group"; group: TreeBranch; open: boolean }
  | { kind: "branch"; branch: TreeBranch; group: TreeBranch; open: boolean }
  | { kind: "family"; label: string; count: number; open: boolean }
  | { kind: "page"; page: Hit; nested: boolean };

/** What is open, by id. `null` at a level means nothing open at that level. */
interface Open {
  group: string | null;
  branch: string | null;
  family: string | null;
}

function linesOf(groups: TreeBranch[], open: Open): Line[] {
  const lines: Line[] = [];
  for (const group of groups) {
    const groupOpen = group.id === open.group;
    lines.push({ kind: "group", group, open: groupOpen });
    if (!groupOpen) continue;

    for (const branch of group.branches) {
      const branchOpen = branch.id === open.branch;
      lines.push({ kind: "branch", branch, group, open: branchOpen });
      if (!branchOpen) continue;

      const { families, loose } = familiesOf(branch.pages);
      for (const family of families) {
        const familyOpen = family.label === open.family;
        lines.push({
          kind: "family",
          label: family.label,
          count: family.pages.length,
          open: familyOpen,
        });
        if (familyOpen) {
          for (const page of family.pages) lines.push({ kind: "page", page, nested: true });
        }
      }
      for (const page of loose) lines.push({ kind: "page", page, nested: false });
    }
  }
  return lines;
}

export function PageTree({ groups, currentPath, bookmarked, className }: PageTreeProps) {
  // Nodes opens with the panel: it is where most sessions start, and a list
  // that opens entirely closed asks for a click before it says anything.
  const [open, setOpen] = useState<Open>({ group: "nodes", branch: null, family: null });
  const [top, setTop] = useState(0);

  const lines = useMemo(() => linesOf(groups, open), [groups, open]);

  /* The panel follows the reader. A page reached from anywhere but this panel
     — the search overlay, a link in the text, the history arrows — leaves the
     panel showing wherever it was left, which is the wrong place by definition.
     Opening the group, the branch and the family the page sits in makes the
     panel say where the reader IS, not where they last clicked. */
  useEffect(() => {
    if (!currentPath) return;
    for (const group of groups) {
      for (const branch of group.branches) {
        if (!branch.pages.some((page) => page.path === currentPath)) continue;
        const { families } = familiesOf(branch.pages);
        setOpen({
          group: group.id,
          branch: branch.id,
          family:
            families.find((one) => one.pages.some((page) => page.path === currentPath))?.label ??
            null,
        });
        return;
      }
    }
  }, [currentPath, groups]);

  /* Where that page sits in the list, so the list can scroll to it — ONCE,
     on arriving. Opening a family further down moves that row, and a list
     that chased it would throw the reader back to a page they opened minutes
     ago every time they open something. */
  const revealed = useRef<string | undefined>(undefined);
  const wants = currentPath !== revealed.current;
  const at = useMemo(
    () => lines.findIndex((line) => line.kind === "page" && line.page.path === currentPath),
    [lines, currentPath],
  );
  // Marked only once the row is actually in the list: the tree arrives after
  // the first paint, and marking a page revealed before its row exists is a
  // reveal that never happens.
  useEffect(() => {
    if (at >= 0) revealed.current = currentPath;
  });
  const reveal = wants ? at : -1;

  /* The rows that must not leave: every open row above the reader. The group,
     the branch inside it and the family inside that are the path to whatever
     page is under the pointer, and a list that scrolls that path away stops
     saying where the reader is.

     A row is pinned once it would go under the rows already pinned above it —
     `slot` is how many of those there are — so the pinned copy takes over at
     the moment the real row reaches that place, and a row passing behind it
     reads as scrolling under a header rather than as a row drawn twice. */
  const groupAt = lines.findIndex((line) => line.kind === "group" && line.open);
  const branchAt = lines.findIndex((line) => line.kind === "branch" && line.open);
  const familyAt = lines.findIndex((line) => line.kind === "family" && line.open);
  /* Where a section ends: the last line under it. A header holds its place
     only while there is still something of its own below it — once the last
     page of the family has gone by, the family's name is naming nothing and
     scrolls away with it. */
  const endOf = (from: number, ranks: Line["kind"][]) => {
    if (from < 0) return -1;
    let end = from;
    while (end + 1 < lines.length && !ranks.includes(lines[end + 1].kind)) end += 1;
    return end;
  };
  const groupEnd = endOf(groupAt, ["group"]);
  const branchEnd = endOf(branchAt, ["group", "branch"]);
  const familyEnd = endOf(familyAt, ["group", "branch", "family"]);
  const holds = (from: number, end: number, slot: number) =>
    from >= 0 && top > (from - slot) * ROW && top < (end - slot) * ROW;
  const pinGroup = holds(groupAt, groupEnd, 0);
  const pinBranch = holds(branchAt, branchEnd, 1);
  const pinFamily = holds(familyAt, familyEnd, 2);

  /* The pinned rows are drawn over the list, not in it, so they do not get
     the scrollbar's reserved gutter that every row inside the list gets. Left
     alone, a header's count jumps right the moment it pins. The gutter is
     measured off the list and given back as padding. */
  const nav = useRef<HTMLElement>(null);
  const [gutter, setGutter] = useState(0);
  useEffect(() => {
    const list = nav.current?.querySelector<HTMLElement>("[data-list]");
    if (!list) return;
    const measure = () => setGutter(list.offsetWidth - list.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  const openGroup = groups.find((group) => group.id === open.group);
  const openBranch = openGroup?.branches.find((branch) => branch.id === open.branch);
  const openFamily = familyAt >= 0 ? (lines[familyAt] as Extract<Line, { kind: "family" }>) : null;
  const GroupMark = openGroup ? groupIcon(openGroup.id) : null;

  const toggleGroup = (id: string) =>
    setOpen((now) =>
      now.group === id
        ? { group: null, branch: null, family: null }
        : { group: id, branch: null, family: null },
    );
  const toggleBranch = (id: string) =>
    setOpen((now) => ({ ...now, branch: now.branch === id ? null : id, family: null }));
  const toggleFamily = (label: string) =>
    setOpen((now) => ({ ...now, family: now.family === label ? null : label }));

  return (
    <nav ref={nav} aria-label="Documentation" className={cn("relative flex min-h-0 flex-col", className)}>
      {/* Drawn over the list, not inside it — see the note at the top of the
          file. `pointer-events-none` on the box and back on the rows, so the
          gap beside a pinned header still scrolls the list under it. */}
      {(pinGroup || pinBranch || pinFamily) && (
        <div
          style={{ paddingRight: gutter }}
          className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-neutral-100"
          data-pinned=""
        >
          {pinGroup && openGroup && (
            <SidebarRow
              label={openGroup.label}
              header
              mark={GroupMark ? <GroupMark className="size-[15px] text-brand" /> : undefined}
              disclosure="expanded"
              count={openGroup.count}
              onClick={() => toggleGroup(openGroup.id)}
              className="pointer-events-auto"
            />
          )}
          {pinBranch && openBranch && (
            <SidebarRow
              label={openBranch.label}
              icon={openBranch.icon ?? null}
              count={openBranch.count}
              disclosure="expanded"
              onClick={() => toggleBranch(openBranch.id)}
              className="pointer-events-auto ml-[19px] w-[calc(100%-19px)]"
            />
          )}
          {pinFamily && openFamily && (
            <SidebarRow
              label={openFamily.label}
              count={openFamily.count}
              disclosure="expanded"
              onClick={() => toggleFamily(openFamily.label)}
              className="pointer-events-auto ml-[42px] w-[calc(100%-42px)]"
            />
          )}
        </div>
      )}

      <VirtualList
        items={lines}
        rowHeight={ROW}
        reveal={reveal}
        onTop={setTop}
        // Slack on the left for what a row draws outside its own box — the
        // bookmark flag hangs 9px past the mark, the chip's shadow spreads past
        // every edge — given back as a negative margin so the rows keep their
        // axis. The right edge is the bar's: `.thin-scroll` holds its place
        // whether the list scrolls or not, so a list that starts to scroll
        // does not step its own rows sideways.
        className="-ml-slack flex-1 pl-slack"
      >
        {(line) => {
          if (line.kind === "group") {
            const Mark = groupIcon(line.group.id);
            return (
              <SidebarRow
                key={`group:${line.group.id}`}
                label={line.group.label}
                header
                // No chip, open or shut. The chip means "the row you are on",
                // and it is the page row's alone — a lit group and a lit page
                // on screen together read as two selections.
                mark={
                  Mark ? (
                    <Mark
                      className={cn("size-[15px]", line.open ? "text-brand" : "text-neutral-500")}
                    />
                  ) : undefined
                }
                disclosure={line.open ? "expanded" : "collapsed"}
                count={line.group.count}
                onClick={() => toggleGroup(line.group.id)}
              />
            );
          }

          if (line.kind === "branch") {
            return (
              <SidebarRow
                key={`branch:${line.branch.id}`}
                label={line.branch.label}
                // `null`, not `undefined`: a branch the install ships no icon
                // for still holds the mark's column open, so the names under
                // one group stay on one axis.
                icon={line.branch.icon ?? null}
                count={line.branch.count}
                // No chip when it is open. The chip means "the row you are on",
                // and a branch you are inside is not that — its own arrow
                // already says it is open, and two chips lit at once read as
                // two selections.
                disclosure={line.open ? "expanded" : "collapsed"}
                quietDisclosure={!line.open}
                onClick={() => toggleBranch(line.branch.id)}
                className="ml-[19px] w-[calc(100%-19px)]"
              />
            );
          }

          if (line.kind === "family") {
            return (
              <SidebarRow
                key={`family:${line.label}`}
                // No mark at all. A family is a place inside the branch, not a
                // page, and the page glyph said the opposite. Leaving the slot
                // out is also what puts the family NAME on the axis the pages
                // under it put their ICONS on.
                label={line.label}
                count={line.count}
                disclosure={line.open ? "expanded" : "collapsed"}
                onClick={() => toggleFamily(line.label)}
                className="ml-[42px] w-[calc(100%-42px)]"
              />
            );
          }

          return (
            <SidebarRow
              key={line.page.path}
              label={line.page.title}
              icon={line.page.icon ?? null}
              to={`/${line.page.path}`}
              selected={line.page.path === currentPath}
              kept={bookmarked?.has(line.page.path)}
              // A page under a family starts its ICON where that family's NAME
              // starts, which is what makes it read as contents of the family
              // rather than as its neighbour.
              className={line.nested ? "ml-[65px] w-[calc(100%-65px)]" : "ml-[42px] w-[calc(100%-42px)]"}
            />
          );
        }}
      </VirtualList>
    </nav>
  );
}
