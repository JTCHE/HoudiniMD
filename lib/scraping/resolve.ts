import { SIDEFX_DOCS_ROOT } from "@/lib/houdini";
import { toSideFXUrl } from "@/lib/url";
import { checkPageExists, PageNotFoundError } from "./scraper";

/** Resolve the SideFX spelling that serves a normalized document slug. */
export async function resolveSideFXUrl(slug: string): Promise<string> {
  const sideFXUrl = toSideFXUrl(slug);
  try {
    await checkPageExists(sideFXUrl);
    return sideFXUrl;
  } catch (error) {
    if (!(error instanceof PageNotFoundError)) throw error;
    const slugBase = slug.split("#")[0];
    const fallbackUrl = slugBase.endsWith("/index")
      ? `${SIDEFX_DOCS_ROOT}/${slugBase}.html`
      : `${SIDEFX_DOCS_ROOT}/${slugBase}/index.html`;
    await checkPageExists(fallbackUrl);
    return fallbackUrl;
  }
}
