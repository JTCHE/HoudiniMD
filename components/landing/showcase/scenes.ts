/**
 * What the pointer does in each tab that shows the app. Every step is a step a
 * reader takes; the page it opens is timed by the page itself.
 */
import type { Driver } from "@/components/landing/showcase/driver";

const FIELD = 'input[aria-label="Search the Houdini documentation"]';

/** The home screen, with an empty field and no page open. */
async function home(d: Driver) {
  d.hide();
  if (d.win.location.pathname !== "/") d.go("/");
  const field = await d.waitFor(() => d.$(FIELD) as HTMLInputElement | null);
  if (field.value) await d.clear(field);
  field.blur();
  return field;
}

export async function searchScene(d: Driver) {
  const field = await home(d);
  await d.sleep(300);
  await d.key("k", { label: "Ctrl K" });
  await d.type(field, "scatter");
  await d.sleep(1300);
  await d.key("ArrowDown", { label: "↓" });
  await d.key("ArrowDown", { label: "↓" });
  await d.sleep(700);
  await d.clear(field);
  await d.type(field, "vex: noise");
  await d.sleep(2200);
  await d.clear(field);
  field.blur();
}

export async function pagesScene(d: Driver) {
  const field = await home(d);
  await d.sleep(500);
  await d.key("k", { label: "Ctrl K" });
  await d.type(field, "scatter");
  await d.sleep(600);
  const row = await d.waitFor(() =>
    d.find("button", (el) => (el.textContent ?? "").startsWith("Scatter") && (el.textContent ?? "").includes("Geometry")),
  );
  await d.open(row, "Scatter");
  await d.sleep(1400);

  const article = () => d.$("article")!;
  const inline = await d.waitFor(() => d.byText("Copy to Points", "a", article()));
  await d.point(inline, { dwell: 1500 });
  await d.open(inline, "Copy to Points");
  await d.sleep(1200);

  const shell = d.$(".docs-shell")!;
  const code = await d.waitFor(() => d.$("article pre"));
  await d.scroll(shell, code, 160);
  await d.sleep(500);
  const copy = d.$('button[aria-label="Copy code"]');
  if (copy) {
    await d.press(copy);
    await d.sleep(1100);
  }

  // The last link of that name: the one under Related, at the page's end.
  const related = await d.waitFor(() =>
    [...article().querySelectorAll("a")].filter((a) => a.textContent?.trim() === "Attribute Wrangle").at(-1),
  );
  await d.scroll(shell, related, 260);
  await d.open(related, "Attribute Wrangle");
  await d.sleep(1800);
}
