/** Minor words that stay lowercase mid-title, per standard Title Case rules.
 *  Not applied to the first or last word. */
const MINOR_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "in", "nor", "of", "on",
  "or", "so", "the", "to", "up", "yet",
]);

/** Words Houdini always writes in full caps. Title Case must leave them
 *  alone: a LOP node is not a "Lop" node.
 *
 *  Only words whose acronym reading wins in this documentation are here. `top`
 *  and `mat` are contexts too, but they are also ordinary English words, and
 *  "TOP of the list" reads worse than the case it fixes. */
const ACRONYMS = new Set([
  "sop", "sops", "dop", "dops", "lop", "lops", "vop", "vops", "cop", "cops",
  "cop2", "chop", "chops", "rop", "rops", "obj", "vex", "cvex", "hom", "hda",
  "hdas", "usd", "rbd", "pdg", "api", "url", "uv", "uvs", "ik", "fk",
]);

/** Title-Case a string. Each word is lowercased, then only its first letter
 *  is capitalized — this covers plain English words (`vex` → `Vex`) and
 *  code-identifier words (`opinput` → `Opinput`) with one rule, and never
 *  forces the rest of a word to uppercase. Minor words (of/in/a/the/and)
 *  stay lowercase unless they open or close the title. An acronym goes to
 *  full caps. */
export function toTitleCase(text: string): string {
  const words = text.split(" ");
  return words
    .map((word, i) => {
      if (!word) return word;
      const lower = word.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      const isMinor = i !== 0 && i !== words.length - 1 && MINOR_WORDS.has(lower);
      return isMinor ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/** Build the display title for a docs page: `Name – Type`, Title Cased.
 *  `nodeType` is the page kind pulled from frontmatter (e.g. "geometry
 *  node", "VEX function"). Pages without one (plain articles) degrade to
 *  just the Title Cased name — no fabricated type is inserted. */
export function formatPageTitle(name: string, nodeType?: string): string {
  const titleCasedName = toTitleCase(name);
  if (!nodeType) return titleCasedName;
  return `${titleCasedName} – ${toTitleCase(nodeType)}`;
}
