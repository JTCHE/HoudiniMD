/**
 * Search shorthands: `vex:` or `sop:` at the start of the field keeps the
 * search to one part of the docs. VEX functions, VOP nodes and expression
 * functions share many names, and this is how the reader says which they mean.
 *
 * The scope stays in the query text (`vex:noise`), so every field keeps one
 * string of state; the field draws the part before the colon as a chip.
 */
export interface Scope {
  key: string;
  label: string;
  /** Path prefixes a hit must start with. */
  paths: string[];
}

const SCOPES: { keys: string[]; label: string; paths: string[] }[] = [
  { keys: ["v", "vex"], label: "VEX functions", paths: ["vex/functions/"] },
  { keys: ["vop"], label: "VOP nodes", paths: ["nodes/vop/"] },
  { keys: ["sop"], label: "Geometry nodes", paths: ["nodes/sop/"] },
  { keys: ["lop"], label: "Solaris nodes", paths: ["nodes/lop/"] },
  { keys: ["dop"], label: "Dynamics nodes", paths: ["nodes/dop/"] },
  { keys: ["cop"], label: "Copernicus nodes", paths: ["nodes/cop/"] },
  { keys: ["obj"], label: "Object nodes", paths: ["nodes/obj/"] },
  { keys: ["rop", "out"], label: "Render nodes", paths: ["nodes/out/"] },
  { keys: ["chop"], label: "Channel nodes", paths: ["nodes/chop/"] },
  { keys: ["top"], label: "TOP nodes", paths: ["nodes/top/"] },
  { keys: ["apex"], label: "APEX nodes", paths: ["nodes/apex/"] },
  { keys: ["e", "exp", "expr"], label: "Expression functions", paths: ["expressions/"] },
  { keys: ["py", "hom"], label: "Python (HOM)", paths: ["hom/"] },
  { keys: ["hs", "hscript"], label: "HScript commands", paths: ["commands/"] },
  { keys: ["ex", "example"], label: "Examples", paths: ["examples/"] },
];

const SHORTHAND = /^([a-z]+):\s*/i;

/** The scope a query starts with, and the words after it. */
export function parseScope(query: string): { scope: Scope | null; rest: string } {
  const found = SHORTHAND.exec(query);
  const key = found?.[1].toLowerCase();
  const entry = key ? SCOPES.find((scope) => scope.keys.includes(key)) : undefined;
  if (!found || !key || !entry) return { scope: null, rest: query };
  return { scope: { key, label: entry.label, paths: entry.paths }, rest: query.slice(found[0].length) };
}

export function inScope(scope: Scope | null, path: string): boolean {
  return !scope || scope.paths.some((prefix) => path.startsWith(prefix));
}

/**
 * What a search field needs to draw a chip: the text for the input (the query
 * without its shorthand), the scope, and the change and key handlers that keep
 * the shorthand in the query. Backspace in an empty input takes the chip away.
 */
export function scopedInput(query: string, setQuery: (next: string) => void) {
  const { scope, rest } = parseScope(query);
  return {
    scope,
    text: scope ? rest : query,
    change: (value: string) => setQuery(scope ? `${scope.key}:${value}` : value),
    /** True when it used the key. */
    key: (event: React.KeyboardEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      if (!scope || event.key !== "Backspace" || input.selectionStart !== 0 || input.selectionEnd !== 0) return false;
      event.preventDefault();
      setQuery(rest);
      return true;
    },
  };
}
