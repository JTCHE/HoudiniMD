/**
 * Sparse BM25 over full page content, sharded in R2.
 *
 * Fuse scored slug + title + summary only, and had no IDF: `distance` (on
 * hundreds of pages) counted as much as `geodesic` (on one), and body text was
 * never indexed at all — so a description of what a node does could not find
 * the node. BM25 fixes both.
 *
 * Sharding turns a query into I/O instead of CPU: fetch the postings for the
 * 3-5 query tokens in parallel, then score a few thousand postings. No index
 * is constructed per request.
 *
 * `scripts/build-search-index.ts` imports the tokenizer and `shardOf` from
 * here, so the index and the query can never disagree about either.
 */

/** Number of postings files. ~80 KB each over the current corpus. */
export const SHARD_COUNT = 256;

export const DOCS_KEY = "search/docs.json";
export const shardKey = (n: number) => `search/index/${n}.json`;

/** Public shape, returned to callers of the ranker and `/api/search`. */
export interface DocHeading {
  text: string;
  /** `id` of the heading element — the anchor to link to. */
  slug: string;
}

/**
 * How a heading is stored: `[text, slug]`.
 *
 * Tuples rather than objects because the corpus holds ~107k headings, and the
 * repeated `"text"`/`"slug"` keys cost ~1.6 MB of docs.json on their own — paid
 * on every cold isolate. Only the handful of headings a query actually returns
 * are widened into `DocHeading`.
 */
export type StoredHeading = [text: string, slug: string];

export interface SearchDoc {
  path: string;
  title: string;
  summary: string;
  category: string;
  version: string;
  icon?: string;
  /** title lowercased, whitespace stripped — precomputed for the exact/prefix pass */
  t: string;
  /** last path segment, lowercased */
  s: string;
  /** body token count, for BM25 length normalisation */
  dl: number;
  /** Index 0 is the page top (no anchor); postings index into this. */
  headings: StoredHeading[];
  /**
   * Set when other pages live beneath this path — i.e. this is a section
   * listing. Computed from the corpus rather than pattern-matched, because the
   * shapes vary: `houdini/nodes/lop`, `houdini/vex/functions`, any `index`.
   */
  nav?: 1;
}

export interface DocsTable {
  avgdl: number;
  /**
   * Public origin the postings shards live under, stamped in by the build.
   *
   * The browser needs it and cannot read server env; carrying it here beats a
   * `NEXT_PUBLIC_` var because the writer of the index is the one thing that
   * definitely knows where it put the shards, so the two cannot drift.
   */
  origin: string;
  /** Identifies this build. Shards from a different one are discarded. */
  build: string;
  docs: SearchDoc[];
}

/** `[docId, term frequency, index into that doc's headings[]]` */
export type Posting = [number, number, number];

/**
 * A postings file. `build` must equal the doc table's `build`.
 *
 * `docId` is an array position in `docs.json`, so a table and a shard from
 * different builds disagree about which page every posting refers to — adding
 * one page shifts every id after it. Caches make that reachable: a browser can
 * hold the table for 5 minutes and the edge for a day while the shards are
 * already new. Comparing the stamp turns a silent wrong answer into a miss.
 */
export interface Shard {
  build: string;
  tokens: Record<string, Posting[]>;
}

// Dropped from both the index and the query. Everything else is kept — IDF
// already discounts common words, so this list only needs to cover terms so
// frequent that storing their postings is pure waste.
const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "how", "use",
  "using", "when", "what", "into", "over", "its", "are", "all", "each", "you",
  "was", "were", "will", "can", "not", "but", "has", "have", "had", "then",
  "than", "they", "them", "their", "there", "here", "which", "who", "your",
  "any", "may", "such", "also", "only", "does", "did", "been", "being",
]);

/**
 * Fold a plural or third-person verb onto its singular.
 *
 * `read a point attribute` could not find the `point` VEX function whose
 * summary opens "Reads a point attribute value", because `read` and `reads`
 * were unrelated tokens. Same for `point`/`points` and `function`/`functions`.
 *
 * Deliberately only the -s family. Stripping -ing and -ed as well would turn
 * `wrangling` into `wrangl` and merge words that mean different things in this
 * corpus; plurals are where the misses actually are. Runs on both the index and
 * the query, from this one function, so the two cannot disagree.
 */
function singular(t: string): string {
  // Three letters are left alone: `abs`, `pos` and `eps` are VEX function
  // names, not plurals, and folding them loses the page they name.
  if (t.length <= 3 || !t.endsWith("s")) return t;
  // Words that merely end in s: class, axis, status, bias, gas.
  if (/(ss|is|us)$/.test(t)) return t;
  // properties -> property, but leave 3-letter -ies alone.
  if (t.length > 4 && t.endsWith("ies")) return `${t.slice(0, -3)}y`;
  // boxes -> box, meshes -> mesh. Only after a sibilant, or "es" is not a suffix.
  if (t.length > 4 && t.endsWith("es") && /[sxzh]$/.test(t.slice(0, -2))) return t.slice(0, -2);
  // nodes -> node, points -> point. A vowel before the s usually means it
  // belongs to the word (bias), except e, which is the stem's own final letter.
  if (/[aiu]s$/.test(t)) return t;
  return t.slice(0, -1);
}

/**
 * The single tokenizer. Two-character tokens are kept on purpose — `uv` and
 * `id` are real Houdini query terms.
 */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const t of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (t.length > 1 && t.length <= 40 && !STOPWORDS.has(t)) out.push(singular(t));
  }
  return out;
}

/** FNV-1a — cheap, well spread, and identical in the build script. */
export function shardOf(token: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % SHARD_COUNT;
}

// Module-scope shard cache. On a warm isolate a popular token costs 0 ms and a
// rare one costs a single fetch — which is the point of sharding rather than
// loading the whole ~20 MB index and risking the 128 MB isolate ceiling.
// ponytail: insertion-order Map as the LRU; a real LRU only if profiling asks.
const SHARD_CACHE_MAX = 64;
const EMPTY: Shard = { build: "", tokens: {} };
const shardCache = new Map<string, Shard>();
const inflight = new Map<string, Promise<Shard>>();

async function loadShard(table: DocsTable, n: number): Promise<Shard> {
  // Key by build too, so a rebuild never reads through to the old postings.
  const key = `${table.build}:${n}`;
  const hit = shardCache.get(key);
  if (hit) {
    shardCache.delete(key); // re-insert so it counts as recently used
    shardCache.set(key, hit);
    return hit;
  }

  let pending = inflight.get(key);
  if (!pending) {
    // `?v=` busts the browser and edge caches that would otherwise pair a fresh
    // table with postings from the previous build.
    pending = fetch(`${table.origin}/${shardKey(n)}?v=${encodeURIComponent(table.build)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Shard>) : EMPTY))
      .then((s) => (s?.build === table.build ? s : EMPTY))
      // A missing, stale or unreachable shard degrades that token to no
      // matches. It must never take the whole query down — an empty result
      // reads to an agent as proof the node does not exist.
      .catch(() => EMPTY)
      .finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }

  const shard = await pending;
  shardCache.set(key, shard);
  if (shardCache.size > SHARD_CACHE_MAX) {
    shardCache.delete(shardCache.keys().next().value!);
  }
  return shard;
}

const K1 = 1.2;
const B = 0.75;
/**
 * Weight of the title field, scored separately from the body.
 *
 * This cannot live in the postings. BM25 saturates tf around 5, so the build's
 * `TITLE_TF_BOOST` is invisible on any page that also says the word in its body:
 * for `solver pyro`, `dop/pyrosolver` scored tf 51/55 and the pyro guide pages
 * scored 53/57 — indistinguishable, and the node page then LOST on length
 * normalisation because it carries the parameter tables.
 *
 * Saturation is also why `light lop` could not find `lop/light`. That page
 * carries `light` at tf 180 and `lop` at tf 8, and still lost: above tf ~20
 * every page scores alike, so the order fell to noise.
 */
const TITLE_WEIGHT = 1.2;
/**
 * How much of the title bonus depends on the query covering the WHOLE name.
 *
 * Presence alone cannot rank: "Light 2.0", "Portal Light" and "Karma Blocker
 * Light Filter" all contain `light`. What separates them is how much of the
 * page's own name the query accounts for — all of it, half of it, a fifth.
 *
 * Measured by characters, not tokens, because Houdini names are jammed
 * together. `reduce poly` covers every character of `polyreduce` while sharing
 * no whole token with it, which is why token equality alone ranked
 * `Labs Tree Trunk Generator` above `PolyReduce`.
 */
const COVERAGE_SHARE = 0.85;
/**
 * Extra for a query token that IS the page's whole name.
 *
 * Coverage alone treats "light" filling all of `light` the same as "reduce"
 * plus "poly" filling all of `polyreduce`, but the first is a far stronger
 * claim: the reader typed the node's exact name and added a context word.
 * Without this, `light lop` put `Portal Light` above `Light`, because the real
 * Light page is four times longer and BM25 charges it for that.
 *
 * Scaled by how much of the QUERY the name explains, or it fires on pages that
 * are named after one word of a longer query: the guide at `houdini/pyro/pyro`
 * has the literal slug `pyro`, and for `solver pyro` it briefly outranked the
 * Pyro Solver node by matching half the question perfectly.
 */
const EXACT_NAME_WEIGHT = 0.5;
/**
 * Same idea, one field weaker: the summary is the page's own one-line answer to
 * "what is this". `cube` ranked `sop/box` 19th — its summary opens "Creates a
 * cube or six-sided rectangular box", but that is three tf against a Copernicus
 * page that says "cubemap" throughout, and tf had already saturated.
 *
 * Swept 0 / 0.25 / 0.35 / 0.5 / 0.75: `cube` finds the box at 19 / 6 / 5 / 5 / 4,
 * and from 0.5 up the summary starts outvoting the title — `solver pyro` slips
 * to 2 and then 3. 0.35 takes the win before that begins.
 */
const SUMMARY_WEIGHT = 0.35;
/**
 * Weight of a run of query words found BACK TO BACK in the summary.
 *
 * Scoring words one at a time throws away their order, so "reads a point
 * attribute" — which is the `point` VEX function's summary, word for word —
 * counted as three separate common words and lost to `Karma Point Cloud Read`,
 * a page whose title merely contains two of them.
 *
 * A phrase is a much stronger claim than the same words scattered, so this
 * outweighs the plain summary signal. It fires only on the WHOLE query, and
 * scales with the idf of what matched, so a run of common words earns little.
 *
 * Swept 0.5 / 0.7 / 0.9 / 1.1 over a 29-query probe set. 0.5 is too weak to
 * move the page it was built for; from 0.9 up the phrase starts outvoting the
 * title and `reduce polygons` slips behind `greduce`, whose summary happens to
 * open with those two words. Rank-1 hits: 15 / 17 / 16 / 15 of 29.
 */
const PHRASE_WEIGHT = 0.7;
/** How many heading sub-hits to keep per page. */
const MAX_SUBHITS = 3;

// Derived per-doc fields, built only for docs a query actually touches and
// reused across that query's tokens. Storing these in docs.json would cost
// ~1 MB on every cold isolate to save a few thousand short string operations.
interface DocFields {
  /** Lowercased summary, for the weak summary signal. */
  summary: string;
  /** The same summary tokenized, for the phrase signal — order matters here. */
  sumTokens: string[];
  /** Letters and digits of the title, no separators — `Copy to Points 2.0` -> `copytopoints20`. */
  name: string;
  /** Same treatment for the slug. Usually the shorter, more canonical of the two. */
  slug: string;
}
const fieldCache = new Map<number, DocFields>();

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function fieldsOf(docId: number, doc: SearchDoc): DocFields {
  let f = fieldCache.get(docId);
  if (!f) {
    f = {
      summary: doc.summary.toLowerCase(),
      sumTokens: tokenize(doc.summary),
      name: squash(doc.title),
      slug: squash(doc.s),
    };
    fieldCache.set(docId, f);
  }
  return f;
}

export interface Bm25Hit {
  docId: number;
  score: number;
  /** Matching heading indices, strongest first. Index 0 (page top) is excluded. */
  headingIdxs: number[];
}

/**
 * Score the page's name and summary as fields of their own.
 *
 * Coverage is taken against whichever of slug or title the query accounts for
 * better — some pages carry the readable name in the title (`Copy to Points`,
 * slug `copytopoints`), others only in the slug (`kinefx--rigattribwrangle`).
 */
/**
 * The longest run of `q` that appears, in order and unbroken, inside `s`.
 *
 * Both sides come from the one tokenizer, so stopwords are already gone from
 * both — which is what makes "reads a point attribute" an unbroken run against
 * the summary "Reads a point attribute value from a geometry".
 *
 * Quadratic, over a query of a few words and a one-line summary.
 */
function longestRun(q: string[], s: string[]): { at: number; len: number } {
  let at = 0;
  let len = 0;
  for (let i = 0; i < q.length; i++) {
    for (let j = 0; j < s.length; j++) {
      let n = 0;
      while (i + n < q.length && j + n < s.length && q[i + n] === s[j + n]) n++;
      if (n > len) {
        len = n;
        at = i;
      }
    }
  }
  return { at, len };
}

function fieldScore(
  docId: number,
  doc: SearchDoc | undefined,
  v: { nameIdf: number; nameChars: number; summaryIdf: number; exactIdf: number },
  queryChars: number,
  qSeq: string[],
  idfs: Map<string, number>,
): number {
  if (!doc) return 0;
  // Share of the query the name accounts for. `pyrosolver` explains all of
  // "solver pyro"; the `pyro` guide explains four characters of ten.
  const queryCoverage = queryChars ? Math.min(1, v.nameChars / queryChars) : 0;
  let total = v.summaryIdf * SUMMARY_WEIGHT + v.exactIdf * EXACT_NAME_WEIGHT * queryCoverage;
  if (v.nameIdf > 0) {
    const f = fieldsOf(docId, doc);
    const len = Math.min(f.name.length || Infinity, f.slug.length || Infinity);
    const coverage = Math.min(1, v.nameChars / (len || 1));
    total += v.nameIdf * TITLE_WEIGHT * (1 - COVERAGE_SHARE + COVERAGE_SHARE * coverage);
  }

  // Words said back to back, in the order asked for.
  if (qSeq.length > 1) {
    const { at, len } = longestRun(qSeq, fieldsOf(docId, doc).sumTokens);
    // The WHOLE query, or nothing. A partial run fires on any summary that
    // happens to repeat two common words in order, which promoted noise across
    // the probe set — "write a file to disk" put a Labs biome cache first.
    if (len === qSeq.length) {
      let runIdf = 0;
      for (let i = at; i < at + len; i++) runIdf += idfs.get(qSeq[i]) ?? 0;
      total += PHRASE_WEIGHT * runIdf;
    }
  }
  return total;
}

export function scoreTokens(
  tokens: string[],
  shards: Map<number, Shard>,
  table: DocsTable,
  limit: number,
): Bm25Hit[] {
  const N = table.docs.length;
  if (!N) return [];

  interface Acc {
    score: number;
    sections: Map<number, number>;
    /** Summed idf of query tokens found in the page's name. */
    nameIdf: number;
    /** Characters of the name those tokens account for. */
    nameChars: number;
    /** Summed idf of tokens found only in the summary. */
    summaryIdf: number;
    /** Summed idf of tokens that ARE the page's whole name. */
    exactIdf: number;
  }
  const acc = new Map<number, Acc>();
  // A Set keeps insertion order, so this is still the query as it was typed —
  // which the phrase signal needs.
  const unique = new Set(tokens);
  const qSeq = [...unique];
  const idfs = new Map<string, number>();
  let queryChars = 0;
  for (const token of unique) queryChars += token.length;

  for (const token of unique) {
    // `JSON.parse` yields a prototype-bearing object, so tokens that are also
    // Object members ("constructor", "toString") would otherwise resolve to the
    // inherited value rather than a postings list.
    const postings = shards.get(shardOf(token))?.tokens[token];
    if (!Array.isArray(postings) || postings.length === 0) continue;

    const df = postings.length;
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    idfs.set(token, idf);

    for (const [docId, tf, headingIdx] of postings) {
      const doc = table.docs[docId];
      const dl = doc?.dl || table.avgdl;
      const score = (idf * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * dl) / table.avgdl));

      let cur = acc.get(docId);
      if (!cur) {
        cur = {
          score: 0,
          sections: new Map(),
          nameIdf: 0,
          nameChars: 0,
          summaryIdf: 0,
          exactIdf: 0,
        };
        acc.set(docId, cur);
      }
      cur.score += score;

      if (doc) {
        const f = fieldsOf(docId, doc);
        if (f.name.includes(token) || f.slug.includes(token)) {
          cur.nameIdf += idf;
          // Credit the plural if that is what the name actually spells:
          // `copytopoints` gives up six characters to "points", not the five
          // of its stem, and coverage is a measure of the name, not the token.
          const plural = `${token}s`;
          cur.nameChars +=
            f.name.includes(plural) || f.slug.includes(plural) ? plural.length : token.length;
          if (token === f.slug || token === f.name) cur.exactIdf += idf;
        } else if (f.summary.includes(token)) {
          cur.summaryIdf += idf;
        }
      }
      // Each query token contributes its best section, so a page matching
      // several tokens yields several heading sub-hits.
      cur.sections.set(headingIdx, (cur.sections.get(headingIdx) ?? 0) + score);
    }
  }

  return [...acc]
    .map(([docId, v]) => ({
      docId,
      score: v.score + fieldScore(docId, table.docs[docId], v, queryChars, qSeq, idfs),
      headingIdxs: [...v.sections]
        .filter(([idx]) => idx > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_SUBHITS)
        .map(([idx]) => idx),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Tokenize, fetch the needed shards in parallel, score. */
export async function searchBm25(
  q: string,
  table: DocsTable,
  limit: number,
): Promise<Bm25Hit[]> {
  const tokens = tokenize(q);
  if (!tokens.length) return [];

  const ids = [...new Set(tokens.map(shardOf))];
  const loaded = await Promise.all(ids.map((n) => loadShard(table, n)));
  return scoreTokens(tokens, new Map(ids.map((n, i) => [n, loaded[i]])), table, limit);
}
