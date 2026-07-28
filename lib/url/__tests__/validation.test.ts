import { describe, it, expect } from "bun:test";
import { isValidDocUrl, extractSlugFromUrl } from "../validation";

// ---------------------------------------------------------------------------
// The canonical host moved to houdinimd.com. Links pasted from before the move
// (the jchd.me subdomain, the older Netlify host) must keep resolving, because
// they live in Houdini's F1 help-source setting, MCP configs and old posts.
// ---------------------------------------------------------------------------
const SLUG = "houdini/vex/functions/foreach";

describe("isValidDocUrl", () => {
  const accepted = [
    `https://houdinimd.com/docs/${SLUG}`,
    `https://www.houdinimd.com/docs/${SLUG}`,
    `https://houdinimd.jchd.me/docs/${SLUG}`,
    `https://houdinimd.netlify.app/docs/${SLUG}`,
    `https://www.sidefx.com/docs/${SLUG}`,
  ];

  for (const url of accepted) {
    it(`accepts ${url}`, () => {
      expect(isValidDocUrl(url)).toBe(true);
    });
  }

  it("rejects an unrelated host", () => {
    expect(isValidDocUrl(`https://example.com/docs/${SLUG}`)).toBe(false);
  });
});

describe("extractSlugFromUrl", () => {
  it("extracts from the canonical host", () => {
    expect(extractSlugFromUrl(`https://houdinimd.com/docs/${SLUG}`)).toBe(SLUG);
  });

  it("extracts from the pre-move hosts", () => {
    expect(extractSlugFromUrl(`https://houdinimd.jchd.me/docs/${SLUG}`)).toBe(SLUG);
    expect(extractSlugFromUrl(`https://houdinimd.netlify.app/docs/${SLUG}`)).toBe(SLUG);
  });

  it("strips the .md twin suffix and the fragment", () => {
    expect(extractSlugFromUrl(`https://houdinimd.com/docs/${SLUG}.md`)).toBe(SLUG);
    expect(extractSlugFromUrl(`https://houdinimd.com/docs/${SLUG}#notes`)).toBe(SLUG);
  });
});
