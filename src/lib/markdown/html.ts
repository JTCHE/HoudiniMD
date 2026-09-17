// A page as one standalone HTML file that looks like the page the reader is
// looking at. It is not a second renderer: it takes the article out of the
// document, takes the app's own stylesheet with it, and carries the pictures
// and the fonts inside the file. Nothing in it reaches the network, and
// nothing in it needs the app.

import { HOUDINIMD_DOCS_ROOT } from "@/lib/houdini";

/** The window around the article, which the app draws with its shell. */
const SHELL = `
html, body { background: var(--background); color: var(--foreground); }
body { margin: 0; }
/* The app measures against its own shell, not the window (docs-shell), so
   the page it saves has to give the same kind of box to measure. */
.saved-page { container-type: inline-size; margin: 0 auto; max-width: 56rem; padding: 2.5rem 1.75rem 4rem; }
`;

/** What the article carries for the window alone: the buttons in the header,
    the two tables of contents, the copy control on a code panel. */
const CHROME = '[class*="print:hidden"], nav, button, script, [role="menu"]';

const held = new Map<string, Promise<string | null>>();

/** A file, as a `data:` address, read once. The app serves its pictures and
    its fonts through a scheme only this app has, so a reference to one is dead
    the moment the file leaves the app. */
function inline(url: string): Promise<string | null> {
  let data = held.get(url);
  if (!data) held.set(url, (data = read(url)));
  return data;
}

async function read(url: string): Promise<string | null> {
  try {
    const answer = await fetch(url);
    if (!answer.ok) return null;
    const blob = await answer.blob();
    return await new Promise<string>((done, fail) => {
      const reader = new FileReader();
      reader.onload = () => done(String(reader.result));
      reader.onerror = () => fail(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** The app's own stylesheet, as text. */
async function appCss(): Promise<string> {
  const parts: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      parts.push(Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n"));
    } catch {
      // A sheet the page may not read, which only another origin can be.
      if (sheet.href) parts.push(await fetch(sheet.href).then((answer) => answer.text()).catch(() => ""));
    }
  }
  return parts.join("\n");
}

/** The fonts inside the file. Only the Latin faces: the rest are a quarter of
    a megabyte of glyphs no help page has, and the rule that names one simply
    finds no file. */
async function withFonts(css: string): Promise<string> {
  const urls = Array.from(new Set(Array.from(css.matchAll(/url\(["']?([^"')]+)["']?\)/g), (hit) => hit[1]))).filter(
    (url) => !url.startsWith("data:") && /-latin(-ext)?-/.test(url),
  );
  const found = await Promise.all(urls.map(async (url) => [url, await inline(new URL(url, location.href).href)] as const));
  for (const [url, data] of found) if (data) css = css.split(url).join(data);
  return css;
}

function escape(text: string): string {
  return text.replace(/[&<>]/g, (one) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[one]!);
}

/**
 * The page on screen, as a file. `source` is the address it came from, which
 * the file keeps so a reader can go back to it.
 *
 * The body of a long page draws a slice at a time, and a print already has a
 * way to ask for all of it at once — `beforeprint` — so the save asks the same
 * way before it takes the article.
 */
export async function pageHtml({ title, source }: { title: string; source: string }): Promise<string> {
  // Read before the event: a print paints the light theme (`theme.ts`), and
  // the file keeps the theme the reader is reading in.
  const theme = document.documentElement.dataset.theme || "light";
  window.dispatchEvent(new Event("beforeprint"));
  await new Promise((done) => requestAnimationFrame(done));

  const live = document.querySelector("article");
  if (!live) throw new Error("No page to save");
  const page = live.cloneNode(true) as HTMLElement;
  for (const gone of Array.from(page.querySelectorAll(CHROME))) gone.remove();
  window.dispatchEvent(new Event("afterprint"));

  // A link inside the app is a path. Outside it that path means nothing, so it
  // points at the same page on the site.
  for (const link of Array.from(page.querySelectorAll<HTMLAnchorElement>("a[href^='/']"))) {
    link.setAttribute("href", `${HOUDINIMD_DOCS_ROOT}${link.getAttribute("href")}`);
  }

  const [, css] = await Promise.all([
    Promise.all(
      Array.from(page.querySelectorAll("img")).map(async (picture) => {
        const data = await inline(picture.src);
        if (data) picture.setAttribute("src", data);
        else picture.remove();
      }),
    ),
    appCss().then(withFonts),
  ]);

  return `<!doctype html>
<html lang="en" data-theme="${escape(theme)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>${css}</style>
<style>${SHELL}</style>
</head>
<body>
<div class="saved-page">
${page.outerHTML}
<p class="mt-8 text-sm text-muted-foreground"><a href="${escape(source)}">${escape(source)}</a></p>
</div>
</body>
</html>
`;
}
