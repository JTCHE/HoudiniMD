/**
 * What the pointer does in each tab that shows the app. Every step is a step a
 * reader takes; the page it opens is timed by the page itself.
 */
import type { Driver } from "@/components/landing/showcase/driver";

/** The search over a page, which Ctrl K opens. */
const OVERLAY = 'input[type="search"]';

/** The page the app opens on, where the first scene starts: the reader never
    sees the home screen come and go. */
export const START = { path: "nodes/sop/scatter", title: "Scatter" };

/** A page, drawn at once: a scene starts in the app, not on its home screen. */
async function onPage(d: Driver, path: string, title: string) {
  d.hide();
  if (d.win.location.pathname !== `/${path}`) d.go(`/${path}`);
  await d.waitFor(() => d.pageTitle() === title);
}

/** A page, its picture full screen, a link with its preview, the page kept,
    and the next page through the sidebar: every page opens and is timed. */
export async function navigationScene(d: Driver) {
  await onPage(d, START.path, START.title);
  // The reader has just come to the page, and reads its top first.
  await d.sleep(1800);

  const article = () => d.$("article")!;
  const picture = await d.waitFor(() => article().querySelector("img.markdown-media"));
  await d.point(picture, { dwell: 200 });
  await d.press(picture);
  await d.sleep(1300);
  await d.key("Escape", { label: "Esc" });
  await d.sleep(300);

  const inline = await d.waitFor(() => d.byText("Copy to Points", "a", article()));
  // Long enough to read the link's preview.
  await d.point(inline, { dwell: 800 });
  await d.open(inline, "Copy to Points");
  await d.sleep(700);

  // Kept: the page takes its place under Bookmarks in the sidebar. A second
  // round finds it kept, and Ctrl D would take it off again.
  if (!d.$('button[aria-pressed="true"][aria-label="Remove the bookmark"]')) {
    await d.key("d", { label: "Ctrl D" });
    await d.sleep(600);
  }

  // The next page, through the sidebar: the open folder folds away, and
  // another opens onto the page. A phone has no sidebar, and takes the link.
  const aside = d.$("aside");
  if (!aside?.offsetWidth) {
    const wrangle = await d.waitFor(() => d.byText("Attribute Wrangle", "a", article()));
    await d.open(wrangle, "Attribute Wrangle");
  } else {
    for (const label of ["Geometry", "Utility"]) {
      await d.press(await d.waitFor(() => folder(d, aside, label)));
      await d.sleep(350);
    }
    const row = await d.waitFor(() => d.byText("Attribute Wrangle", "a", aside));
    await d.point(row, { dwell: 150 });
    await d.open(row, "Attribute Wrangle");
  }
  await d.sleep(1200);
}

/** A folder row of the sidebar, by its name. Its count is part of its text,
    and a folder with rows open repeats as the list's sticky heading, kept
    under the rows above it: the row is the one a hand can reach. */
const folder = (d: Driver, aside: HTMLElement, label: string) =>
  [...aside.querySelectorAll<HTMLElement>("button[aria-expanded]")].find(
    (el) => el.textContent?.trim().replace(/[\d,]+$/, "") === label && d.shows(el),
  );

/** Ctrl K over the page the reader is on: a node, then a VEX function by its
    scope, which opens. */
export async function searchScene(d: Driver) {
  if (d.win.location.pathname === "/") await onPage(d, "nodes/sop/attribwrangle", "Attribute Wrangle");
  d.hide();
  await d.sleep(300);
  await d.key("k", { label: "Ctrl K" });
  const field = await d.waitFor(() => d.$(OVERLAY) as HTMLInputElement | null);
  await d.type(field, "scatter");
  await d.sleep(500);
  await d.key("ArrowDown", { label: "↓" });
  await d.key("ArrowDown", { label: "↓" });
  await d.clear(field);
  await d.type(field, "vex: noise");
  await d.sleep(700);
  await d.open(() => d.key("Enter", { label: "Enter" }), "noise");
  await d.sleep(1500);
}
