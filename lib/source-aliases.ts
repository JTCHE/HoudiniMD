import { fetchFromR2 } from "@/lib/r2/read";
import { saveJsonToR2 } from "@/lib/r2/write";
import { normalizeDocSlug } from "@/lib/url";

const ALIAS_ROOT = "metadata/source-aliases";
const IDENTITY_ROOT = "metadata/source-identities";

export interface SourceAlias {
  alias: string;
  canonical: string;
  fingerprint: string;
  verifiedAt: string;
}

export interface SourceIdentity {
  fingerprint: string;
  canonical: string;
  verifiedAt: string;
}

const ALIAS_CACHE_TTL_MS = 60_000;
type CachedAlias = { value: SourceAlias | null; expiresAt: number };

// Cache misses as well as hits for a short period. The TTL keeps request
// traffic fast without letting a warm worker pin a staged or removed mapping.
const aliasCache = new Map<string, CachedAlias>();

function aliasPath(slug: string): string {
  return `${ALIAS_ROOT}/${normalizeDocSlug(slug)}.json`;
}

export async function fetchSourceAlias(slug: string): Promise<SourceAlias | null> {
  const normalized = normalizeDocSlug(slug);
  if (!normalized.endsWith("/index")) return null;
  const cached = aliasCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) aliasCache.delete(normalized);

  const raw = await fetchFromR2(aliasPath(normalized), true);
  if (!raw) {
    aliasCache.set(normalized, { value: null, expiresAt: Date.now() + ALIAS_CACHE_TTL_MS });
    return null;
  }
  const alias = JSON.parse(raw) as SourceAlias;
  if (alias.alias !== normalized || !alias.canonical || !alias.fingerprint) {
    aliasCache.set(normalized, { value: null, expiresAt: Date.now() + ALIAS_CACHE_TTL_MS });
    return null;
  }
  aliasCache.set(normalized, { value: alias, expiresAt: Date.now() + ALIAS_CACHE_TTL_MS });
  return alias;
}

/** Publish the canonical identity first, then make its alias visible. */
export async function saveVerifiedSourceAlias(
  aliasSlug: string,
  canonicalSlug: string,
  fingerprint: string,
): Promise<SourceAlias> {
  const verifiedAt = new Date().toISOString();
  const alias: SourceAlias = {
    alias: normalizeDocSlug(aliasSlug),
    canonical: normalizeDocSlug(canonicalSlug),
    fingerprint,
    verifiedAt,
  };
  const identity: SourceIdentity = { fingerprint, canonical: alias.canonical, verifiedAt };

  await saveJsonToR2(`${IDENTITY_ROOT}/${fingerprint}.json`, identity);
  await saveJsonToR2(aliasPath(alias.alias), alias);
  aliasCache.set(alias.alias, { value: alias, expiresAt: Date.now() + ALIAS_CACHE_TTL_MS });
  return alias;
}
