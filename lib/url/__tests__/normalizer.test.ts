import { describe, it, expect } from "bun:test";
import { convertToHoudiniMDUrl, normalizeInput, toSideFXUrl } from "../normalizer";

// ---------------------------------------------------------------------------
// convertToHoudiniMDUrl
// ---------------------------------------------------------------------------
describe("convertToHoudiniMDUrl", () => {
  // -------------------------------------------------------------------------
  // The core bug: when SideFX redirects /docs/houdini → /docs/houdini/ and we
  // use the pre-redirect URL as the resolution base, relative links lose the
  // /houdini/ segment.
  // -------------------------------------------------------------------------
  it("resolves relative links correctly when source has a trailing slash (post-redirect)", () => {
    expect(
      convertToHoudiniMDUrl(
        "licensing/index.html",
        "https://www.sidefx.com/docs/houdini/"
      )
    ).toBe("/docs/houdini/licensing/index");
  });

  it("FAILS to resolve correctly when source lacks trailing slash (pre-redirect — demonstrates the bug)", () => {
    // Without the trailing slash 'licensing/index.html' resolves one level up,
    // dropping 'houdini/'. Using response.url (post-redirect) in the scraper
    // ensures this case never occurs in production.
    const result = convertToHoudiniMDUrl(
      "licensing/index.html",
      "https://www.sidefx.com/docs/houdini"
    );
    expect(result).not.toBe("/docs/houdini/licensing/index");
    expect(result).toBe("/docs/licensing/index"); // the wrong path
  });

  it("resolves a sibling relative link from a deep page", () => {
    expect(
      convertToHoudiniMDUrl(
        "carve.html",
        "https://www.sidefx.com/docs/houdini/nodes/sop/cookie.html"
      )
    ).toBe("/docs/houdini/nodes/sop/carve");
  });

  it("resolves a parent-relative link from a deep page", () => {
    // ../vex/… from /houdini/nodes/sop/ → goes up to /houdini/nodes/, then vex/…
    expect(
      convertToHoudiniMDUrl(
        "../vex/functions/foreach.html",
        "https://www.sidefx.com/docs/houdini/nodes/sop/"
      )
    ).toBe("/docs/houdini/nodes/vex/functions/foreach");
  });

  it("passes through anchor-only links unchanged", () => {
    expect(
      convertToHoudiniMDUrl("#shapetab", "https://www.sidefx.com/docs/houdini/nodes/dop/pyrosolver.html")
    ).toBe("#shapetab");
  });

  it("preserves hash fragments in internal links", () => {
    expect(
      convertToHoudiniMDUrl(
        "pyrosolver.html#shapetab",
        "https://www.sidefx.com/docs/houdini/nodes/dop/"
      )
    ).toBe("/docs/houdini/nodes/dop/pyrosolver#shapetab");
  });

  it("rewrites absolute sidefx docs URLs", () => {
    expect(
      convertToHoudiniMDUrl(
        "https://www.sidefx.com/docs/houdini/licensing/index.html",
        "https://www.sidefx.com/docs/houdini/"
      )
    ).toBe("/docs/houdini/licensing/index");
  });

  it("leaves non-sidefx URLs as absolute external links", () => {
    const ext = "https://example.com/some/page";
    expect(convertToHoudiniMDUrl(ext, "https://www.sidefx.com/docs/houdini/")).toBe(ext);
  });

  it("strips .html extension from converted paths", () => {
    expect(
      convertToHoudiniMDUrl(
        "vex/functions/foreach.html",
        "https://www.sidefx.com/docs/houdini/"
      )
    ).toBe("/docs/houdini/vex/functions/foreach");
  });
});

// ---------------------------------------------------------------------------
// normalizeInput
// ---------------------------------------------------------------------------
describe("normalizeInput", () => {
  it("passes through full https URLs unchanged", () => {
    const url = "https://www.sidefx.com/docs/houdini/nodes/sop/carve";
    expect(normalizeInput(url)).toBe(url);
  });

  it("adds https:// to bare sidefx.com domain", () => {
    expect(normalizeInput("sidefx.com/docs/houdini/nodes/sop/carve")).toBe(
      "https://www.sidefx.com/docs/houdini/nodes/sop/carve"
    );
  });

  it("adds https:// to www.sidefx.com domain", () => {
    expect(normalizeInput("www.sidefx.com/docs/houdini/nodes/sop/carve")).toBe(
      "https://www.sidefx.com/docs/houdini/nodes/sop/carve"
    );
  });

  it("expands /docs/… absolute path to full URL", () => {
    expect(normalizeInput("/docs/houdini/vex/functions/foreach")).toBe(
      "https://www.sidefx.com/docs/houdini/vex/functions/foreach"
    );
  });

  it("prefixes /nodes/… bare path with houdini/", () => {
    expect(normalizeInput("/nodes/sop/carve")).toBe(
      "https://www.sidefx.com/docs/houdini/nodes/sop/carve"
    );
  });
});

// ---------------------------------------------------------------------------
// toSideFXUrl
// ---------------------------------------------------------------------------
describe("toSideFXUrl", () => {
  it("converts a slug to a SideFX docs URL", () => {
    expect(toSideFXUrl("houdini/nodes/sop/carve")).toBe(
      "https://www.sidefx.com/docs/houdini/nodes/sop/carve"
    );
  });

  it("strips hash fragments from the slug", () => {
    expect(toSideFXUrl("houdini/nodes/sop/carve#outputs")).toBe(
      "https://www.sidefx.com/docs/houdini/nodes/sop/carve"
    );
  });
});
