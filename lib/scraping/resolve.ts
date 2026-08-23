import { SIDEFX_DOCS_ROOT } from "@/lib/houdini";
import { normalizeDocSlug, slugFromSideFXUrl, toSideFXUrl } from "@/lib/url";
import { checkPageExists, PageNotFoundError } from "./scraper";

export interface ResolvedSource {
  /** SideFX URL that serves the page. */
  url: string;
  /**
   * Slug of the page SideFX actually served. Differs from the requested slug
   * when SideFX redirects the request — it answers any path under a moved
   * section with that section's index page (every /docs/hqueue/** path lands on
   * /docs/houdini/hqueue/), so an unfiltered mirror mints one duplicate page
   * per path a crawler invents.
   */
  canonicalSlug: string;
}

/** Resolve the SideFX spelling that serves a normalized document slug. */
export async function resolveSideFXUrl(slug: string): Promise<ResolvedSource> {
  const sideFXUrl = toSideFXUrl(slug);
  const finalUrl = await (async () => {
    try {
      return await checkPageExists(sideFXUrl);
    } catch (error) {
      if (!(error instanceof PageNotFoundError)) throw error;
      const slugBase = slug.split("#")[0];
      const fallbackUrl = slugBase.endsWith("/index")
        ? `${SIDEFX_DOCS_ROOT}/${slugBase}.html`
        : `${SIDEFX_DOCS_ROOT}/${slugBase}/index.html`;
      return await checkPageExists(fallbackUrl);
    }
  })();

  const requested = normalizeDocSlug(slug.split("#")[0]);
  const served = slugFromSideFXUrl(finalUrl);
  // The /index fallback above is a spelling of the same page, not a redirect.
  const canonicalSlug =
    served === null || served === `${requested}/index` ? requested : served;
  return { url: finalUrl, canonicalSlug };
}
